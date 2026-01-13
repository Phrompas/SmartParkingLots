import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { client as mqttClient, publish } from "../mqtt.js";

const r = express.Router();

// --- simple JWT auth middleware (reads Bearer token) ---
function verifyToken(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const [, token] = auth.split(" ");
    if (!token) return res.status(401).json({ message: "Missing token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // normalize to { id, role }
    req.user = { id: payload.user_id || payload.id, role: payload.role };
    if (!req.user?.id) return res.status(401).json({ message: "Invalid token" });
    next();
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized", error: e.message });
  }
}

// --- helpers ---
function isYYYYMMDD(s) {
  if (!s || typeof s !== "string") return false;
  // Basic pattern check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  // Check month/day coherence
  const [Y, M, D] = s.split("-").map((x) => Number(x));
  return d.getUTCFullYear() === Y && d.getUTCMonth() + 1 === M && d.getUTCDate() === D;
}

// --- GET /users/me ---
r.get("/me", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT user_id, username, email, role, birth_date, full_name, wallet_balance, plate_number FROM Users WHERE user_id=$1 LIMIT 1",
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(404).json({ message: "User not found" });

    return res.json({
      id: u.user_id,
      username: u.username,
      email: u.email,
      role: u.role,
      birth_date: u.birth_date || null,
      full_name: u.full_name || null,
      wallet_balance: u.wallet_balance != null ? Number(u.wallet_balance) : 0,
      plate_number: u.plate_number || null,
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to load profile", error: e.message });
  }
});

// --- PUT /users/me ---
// Accepts: { username?, full_name?, birth_date?, plate_number? } (YYYY-MM-DD for birth_date)
r.put("/me", verifyToken, async (req, res) => {
  try {
    let { username, full_name, birth_date, plate_number } = req.body || {};
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (typeof username === "string") {
      username = username.trim();
      fields.push(`username = $${paramIndex++}`);
      params.push(username || null);
    }
    if (typeof full_name === "string") {
      full_name = full_name.trim();
      fields.push(`full_name = $${paramIndex++}`);
      params.push(full_name || null);
    }
    if (birth_date !== undefined) {
      if (birth_date !== null && !isYYYYMMDD(String(birth_date))) {
        return res.status(400).json({ message: "birth_date must be YYYY-MM-DD or null" });
      }
      fields.push(`birth_date = $${paramIndex++}`);
      params.push(birth_date || null);
    }
    if (plate_number !== undefined) {
      if (plate_number !== null && typeof plate_number === "string") {
        plate_number = plate_number.trim();

        // Check for duplicate plate_number
        const { rows: existing } = await pool.query(
          "SELECT user_id FROM Users WHERE plate_number = $1 AND user_id != $2 LIMIT 1",
          [plate_number, req.user.id]
        );
        if (existing.length > 0) {
          return res.status(409).json({ message: "This plate number is already in use" });
        }
      }
      fields.push(`plate_number = $${paramIndex++}`);
      params.push(plate_number || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No updatable fields provided" });
    }

    params.push(req.user.id);

    const sql = `UPDATE Users SET ${fields.join(", ")} WHERE user_id = $${paramIndex}`;
    await pool.query(sql, params);

    if (plate_number) {
      mqttClient.publish("smartparking/slot1/userPlateUpdated", plate_number);
    }

    // return updated row
    const { rows } = await pool.query(
      "SELECT user_id, username, email, role, birth_date, full_name, wallet_balance, plate_number FROM Users WHERE user_id=$1 LIMIT 1",
      [req.user.id]
    );
    const u = rows[0];
    return res.json({
      id: u.user_id,
      username: u.username,
      email: u.email,
      role: u.role,
      birth_date: u.birth_date || null,
      full_name: u.full_name || null,
      wallet_balance: u.wallet_balance != null ? Number(u.wallet_balance) : 0,
      plate_number: u.plate_number || null,
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to update profile", error: e.message });
  }
});

/* --- WALLET SYSTEM --- */

// GET /users/wallet/me - ดูยอดเงินในกระเป๋า
r.get("/wallet/me", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT wallet_balance FROM Users WHERE user_id=$1",
      [req.user.id]
    );
    const u = rows[0];
    if (!u) return res.status(404).json({ message: "User not found" });
    res.json({ balance: Number(u.wallet_balance) });
  } catch (e) {
    res.status(500).json({ message: "Failed to load wallet", error: e.message });
  }
});

// POST /users/wallet/topup - เติมเงินเข้า wallet
r.post("/wallet/topup", verifyToken, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid topup amount" });
    }

    await pool.query(
      "UPDATE Users SET wallet_balance = wallet_balance + $1 WHERE user_id=$2",
      [amount, req.user.id]
    );

    await pool.query(
      `INSERT INTO WalletTransactions (user_id, tx_type, amount, note)
       VALUES ($1, 'topup', $2, 'Wallet top-up')`,
      [req.user.id, amount]
    );

    const { rows } = await pool.query(
      "SELECT wallet_balance FROM Users WHERE user_id=$1",
      [req.user.id]
    );

    res.json({ ok: true, new_balance: Number(rows[0].wallet_balance) });
  } catch (e) {
    res.status(500).json({ message: "Failed to top up wallet", error: e.message });
  }
});

// GET /users/wallet/history - ดูประวัติธุรกรรม
r.get("/wallet/history", verifyToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tx_id, tx_type, amount, note, created_at, reservation_id
       FROM WalletTransactions
       WHERE user_id=$1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to load wallet history", error: e.message });
  }
});

export default r;