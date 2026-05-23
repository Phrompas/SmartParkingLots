import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeFee } from "../routes/pricing.js";
import { publish, getLatestSlotStatus } from "../mqtt.js";

const r = Router();

// --- MQTT slot helpers ---
const slotOf = (spaceId) => `slot${String(spaceId).padStart(2, "0")}`;
const cmdTopicOf = (spaceId) => `parking/${slotOf(spaceId)}/cmd`;

const publishSlotCmd = (spaceId, payload) => {
  try {
    publish(cmdTopicOf(spaceId), {
      slotId: slotOf(spaceId),
      source: "backend",
      ts: Date.now(),
      ...payload,
    });
  } catch (e) {
    console.error("[MQTT] Failed to publish cmd:", e);
  }
};

const publishSlotCancel = (spaceId, userId) => {
  publishSlotCmd(spaceId, { action: "cancel", userId: String(userId) });
};

const publishSlotExpire = (spaceId, userId) => {
  publishSlotCmd(spaceId, { action: "expire", userId: String(userId) });
};

// --- helpers ---
const getUserId = (req) => Number(req.user?.user_id || req.user?.id);

const getSensorReadyState = (snapshot) => {
  const state = String(snapshot?.state || "").toLowerCase();

  return (
    state === "wait_confirm" ||
    state === "occupied_reserved" ||
    state === "occupied"
  );
};

const toSensorPayload = (snapshot) =>
  snapshot
    ? {
        slotId: snapshot.slotId,
        state: snapshot.state,
        userId: snapshot.userId || null,
        remainingMs: snapshot.remainingMs ?? null,
        receivedAt: snapshot.receivedAt || null,
      }
    : null;

const overlapSQL =
  "SELECT 1 FROM reservations WHERE space_id=$1 AND status IN ('reserved','checked-in') AND NOT( end_time<=$2 OR start_time>=$3 ) LIMIT 1";

// Expire ONLY reservations that never checked-in
const expireAndFreeSpaces = async () => {
  const { rows: toExpire } = await pool.query(
    "SELECT reservation_id, user_id, space_id FROM reservations WHERE end_time < NOW() AND status='reserved'"
  );

  if (toExpire.length) {
    await pool.query(
      "UPDATE reservations SET status='expired' WHERE end_time < NOW() AND status='reserved'"
    );

    for (const row of toExpire) {
      publishSlotExpire(row.space_id, row.user_id);
    }
  }

  await pool.query(
    `UPDATE parkingspaces p
       SET current_state='available'
     WHERE NOT EXISTS (
             SELECT 1 FROM reservations r
              WHERE r.space_id = p.space_id
                AND r.status IN ('reserved','checked-in')
                AND r.end_time > NOW()
           )`
  );
};

// --- Create booking ---
r.post("/", requireAuth, async (req, res) => {
  const client = await pool.connect();

  try {
    await expireAndFreeSpaces();

    const { space_id, start_time, end_time, deposit_amount = 50 } = req.body;
    if (!space_id || !start_time || !end_time) {
      return res.status(400).json({
        message: "Missing space_id, start_time or end_time",
      });
    }

    const qr = crypto.randomBytes(8).toString("hex");
    const userId = getUserId(req);

    let reservationId;

    try {
      await client.query("BEGIN");

      const { rows: userRows } = await client.query(
        "SELECT wallet_balance FROM users WHERE user_id=$1 FOR UPDATE",
        [userId]
      );

      const user = userRows[0];
      if (!user) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "User not found" });
      }

      if (Number(user.wallet_balance) < deposit_amount) {
        await client.query("ROLLBACK");
        return res.status(402).json({ message: "Insufficient wallet balance" });
      }

      const { rows: spaceRows } = await client.query(
        "SELECT space_id, current_state FROM parkingspaces WHERE space_id=$1 FOR UPDATE",
        [space_id]
      );

      const space = spaceRows[0];
      if (!space) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Parking space not found" });
      }

      if (space.current_state !== "available") {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Parking space is not available" });
      }

      const { rows: conflict } = await client.query(overlapSQL, [
        space_id,
        start_time,
        end_time,
      ]);

      if (conflict.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "Time slot not available" });
      }

      await client.query(
        "UPDATE users SET wallet_balance = wallet_balance - $1 WHERE user_id=$2",
        [deposit_amount, userId]
      );

      await client.query(
        "INSERT INTO wallettransactions (user_id, tx_type, amount, note) VALUES ($1, 'hold', $2, 'Deposit hold for booking')",
        [userId, deposit_amount]
      );

      const { rows: inserted } = await client.query(
        `INSERT INTO reservations
           (user_id, space_id, qr_code, deposit_amount, deposit_status,
            start_time, end_time, auth_method, status)
         VALUES ($1,$2,$3,$4,'held',$5,$6,'sensor','reserved')
         RETURNING reservation_id`,
        [userId, space_id, qr, deposit_amount, start_time, end_time]
      );

      reservationId = inserted[0].reservation_id;

      await client.query(
        "UPDATE parkingspaces SET current_state='reserved' WHERE space_id=$1",
        [space_id]
      );

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    }

    publishSlotCmd(space_id, {
      action: "reserve",
      userId: String(userId),
    });

    return res.json({
      ok: true,
      reservation_id: reservationId,
      qr_code: qr,
      status: "reserved",
      sensor: null,
      can_check_in: false,
      canCheckIn: false,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to create booking",
      error: e.message,
    });
  } finally {
    client.release();
  }
});

// --- List all bookings for the user ---
r.get("/", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { rows } = await pool.query(
      `SELECT r.*, p.location_id, p.floor_number, p.space_number
       FROM reservations r
       JOIN parkingspaces p ON r.space_id=p.space_id
       WHERE r.user_id=$1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to load bookings",
      error: e.message,
    });
  }
});

// --- Current active booking for the user ---
r.get("/me/current", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { rows } = await pool.query(
      `SELECT r.*, p.location_id, p.floor_number, p.space_number, l.location_name
       FROM reservations r
       JOIN parkingspaces p ON r.space_id=p.space_id
       JOIN locations l ON p.location_id=l.location_id
       WHERE r.user_id=$1
         AND r.status IN ('reserved','checked-in')
         AND r.end_time > NOW()
       ORDER BY r.start_time DESC
       LIMIT 1`,
      [userId]
    );

    const row = rows[0] || null;
    if (!row) return res.json(null);

    const slotId = slotOf(row.space_id);
    const snapshot = getLatestSlotStatus(slotId);
    const sensorReady = getSensorReadyState(snapshot);

    const effectiveStatus =
      row.status === "reserved" && sensorReady ? "wait_confirm" : row.status;

    const now = new Date();
    const checkedInAt = row.checked_in_at || null;
    const elapsed = checkedInAt
      ? Math.floor((now - new Date(checkedInAt)) / 1000)
      : 0;

    const estimate = checkedInAt
      ? await computeFee(pool, checkedInAt, null)
      : 0;

    return res.json({
      ...row,
      status: effectiveStatus,
      server_now: now.toISOString(),
      elapsed_seconds: elapsed,
      fee_estimate: estimate,
      can_check_in: row.status === "reserved" && sensorReady,
      canCheckIn: row.status === "reserved" && sensorReady,
      sensor: toSensorPayload(snapshot),
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to load current booking",
      error: e.message,
    });
  }
});

// --- Booking history for the user ---
r.get("/me/history", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows } = await pool.query(
      `SELECT r.*, p.location_id, p.floor_number, p.space_number, l.location_name
         FROM reservations r
         JOIN parkingspaces p ON r.space_id=p.space_id
         JOIN locations l ON p.location_id=l.location_id
        WHERE r.user_id=$1
          AND (r.status IN ('expired','cancelled','completed') OR r.end_time <= NOW())
        ORDER BY r.start_time DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to load history",
      error: e.message,
    });
  }
});

// Alias: GET /bookings/history
r.get("/history", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows } = await pool.query(
      `SELECT r.*, p.location_id, p.floor_number, p.space_number, l.location_name
         FROM reservations r
         JOIN parkingspaces p ON r.space_id=p.space_id
         JOIN locations l ON p.location_id=l.location_id
        WHERE r.user_id=$1
          AND (r.status IN ('expired','cancelled','completed') OR r.end_time <= NOW())
        ORDER BY r.start_time DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to load history",
      error: e.message,
    });
  }
});

// --- Check-in ---
r.post("/:id/checkin", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { qr_code } = req.body || {};

    const { rows: rrows } = await pool.query(
      `SELECT r.*, p.current_state
         FROM reservations r
         JOIN parkingspaces p ON r.space_id=p.space_id
        WHERE r.reservation_id=$1
          AND r.user_id=$2
        LIMIT 1`,
      [id, userId]
    );

    const row = rrows[0];

    if (!row) return res.status(404).json({ message: "Reservation not found" });

    if (row.status === "checked-in") {
      return res.json({
        ok: true,
        status: "checked-in",
        checked_in_at: row.checked_in_at,
        sensor: toSensorPayload(getLatestSlotStatus(slotOf(row.space_id))),
        can_check_in: false,
        canCheckIn: false,
      });
    }

    if (row.status !== "reserved") {
      return res.status(400).json({ message: "Reservation is not active" });
    }

    if (new Date(row.end_time) <= new Date()) {
      return res.status(400).json({ message: "Reservation expired" });
    }

    if (qr_code && qr_code !== row.qr_code) {
      return res.status(400).json({ message: "Invalid QR code" });
    }

    const slotId = slotOf(row.space_id);
    const snapshot = getLatestSlotStatus(slotId);

    if (!snapshot) {
      return res.status(409).json({
        message: "No live sensor status for this slot yet",
        slotId,
        sensorReady: false,
      });
    }

    const sensorState = String(snapshot.state || "unknown").toLowerCase();
    const sensorUserId = snapshot.userId ? String(snapshot.userId) : null;
    const currentUserId = String(userId);

    const canConfirm = getSensorReadyState(snapshot);

    if (!canConfirm) {
      return res.status(409).json({
        message: `Cannot confirm while slot is ${sensorState}`,
        slotId,
        sensorReady: true,
        currentState: sensorState,
      });
    }

    if (sensorUserId && sensorUserId !== currentUserId) {
      return res.status(403).json({
        message: "Sensor user does not match current user",
        slotId,
        sensorReady: true,
        currentState: sensorState,
      });
    }

    const { rows: updatedRows } = await pool.query(
      `UPDATE reservations
          SET status='checked-in',
              checked_in_at=COALESCE(checked_in_at, NOW())
        WHERE reservation_id=$1
        RETURNING checked_in_at`,
      [id]
    );

    await pool.query(
      "UPDATE parkingspaces SET current_state='occupied' WHERE space_id=$1",
      [row.space_id]
    );

    publishSlotCmd(row.space_id, {
      action: "confirm",
      userId: String(userId),
    });

    return res.json({
      ok: true,
      status: "checked-in",
      checked_in_at: updatedRows[0]?.checked_in_at || new Date().toISOString(),
      sensor: toSensorPayload(snapshot),
      can_check_in: false,
      canCheckIn: false,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to check in",
      error: e.message,
    });
  }
});

// --- Cancel booking ---
r.post("/:id/cancel", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const { rows: crow } = await pool.query(
      `SELECT r.*, p.current_state
         FROM reservations r
         JOIN parkingspaces p ON r.space_id=p.space_id
        WHERE r.reservation_id=$1
          AND r.user_id=$2
        LIMIT 1`,
      [id, userId]
    );

    const row = crow[0];

    if (!row) return res.status(404).json({ message: "Reservation not found" });

    if (
      row.status === "cancelled" ||
      row.status === "expired" ||
      row.status === "completed"
    ) {
      return res.json({ ok: true, status: row.status });
    }

    await pool.query(
      "UPDATE reservations SET status='cancelled' WHERE reservation_id=$1",
      [id]
    );

    const { rows: active } = await pool.query(overlapSQL, [
      row.space_id,
      new Date().toISOString(),
      row.end_time,
    ]);

    if (!active.length) {
      await pool.query(
        "UPDATE parkingspaces SET current_state='available' WHERE space_id=$1",
        [row.space_id]
      );
    }

    publishSlotCancel(row.space_id, userId);

    return res.json({ ok: true, status: "cancelled" });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to cancel booking",
      error: e.message,
    });
  }
});

// --- Complete booking / close billing ---
r.post("/:id/complete", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authUserId = getUserId(req);

    const { rows: rrows } = await pool.query(
      `SELECT reservation_id, user_id, space_id, status, checked_in_at,
              start_time, deposit_amount, deposit_status
         FROM reservations
        WHERE reservation_id=$1
          AND user_id=$2`,
      [id, authUserId]
    );

    const rdata = rrows[0];

    if (!rdata) return res.status(404).json({ message: "Reservation not found" });

    if (rdata.status !== "checked-in" || !rdata.checked_in_at) {
      return res.status(400).json({
        message: "Cannot complete booking that is not checked-in",
      });
    }

    const now = new Date();
    const totalFee = await computeFee(
      pool,
      new Date(rdata.checked_in_at || rdata.start_time),
      now
    );

    const userId = rdata.user_id;
    const deposit = Number(rdata.deposit_amount || 0);
    let refund = 0;
    let extra = 0;

    if (totalFee > deposit) {
      extra = totalFee - deposit;

      await pool.query(
        "UPDATE users SET wallet_balance = wallet_balance - $1 WHERE user_id=$2",
        [extra, userId]
      );

      await pool.query(
        `INSERT INTO wallettransactions (user_id, reservation_id, tx_type, amount, note)
         VALUES ($1, $2, 'debit', $3, 'Parking fee exceeds deposit')`,
        [userId, id, extra]
      );

      await pool.query(
        "UPDATE reservations SET deposit_status='captured' WHERE reservation_id=$1",
        [id]
      );
    } else {
      refund = deposit - totalFee;

      if (refund > 0) {
        await pool.query(
          "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE user_id=$2",
          [refund, userId]
        );

        await pool.query(
          `INSERT INTO wallettransactions (user_id, reservation_id, tx_type, amount, note)
           VALUES ($1, $2, 'release', $3, 'Refund remaining deposit')`,
          [userId, id, refund]
        );
      }

      await pool.query(
        "UPDATE reservations SET deposit_status='released' WHERE reservation_id=$1",
        [id]
      );
    }

    await pool.query(
      `UPDATE reservations
          SET status='completed',
              checked_out_at=NOW(),
              total_fee=$1
        WHERE reservation_id=$2`,
      [totalFee, id]
    );

    await pool.query(
      "UPDATE parkingspaces SET current_state='available' WHERE space_id=$1",
      [rdata.space_id]
    );

    publishSlotCancel(rdata.space_id, userId);

    return res.json({
      ok: true,
      status: "completed",
      total_fee: totalFee,
      extra_due: extra,
      refund_amount: refund,
    });
  } catch (e) {
    console.error("Complete booking error:", e);
    return res.status(500).json({
      message: "Failed to complete booking",
      error: e.message,
    });
  }
});

export default r;