import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { client as mqttClient, publish } from "../mqtt.js";

const r = Router();

// --- ดึงรายการสถานที่ทั้งหมด ---
r.get("/locations", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT location_id, location_name, address, total_floors, created_at FROM Locations ORDER BY location_name"
    );
    const rows = result.rows;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to load locations", error: e.message });
  }
});

// --- ดึงข้อมูลช่องจอดแบบละเอียด ---
r.get("/", async (req, res) => {
  try {
    const { location_id, floor } = req.query;

    let sql =
      "SELECT p.space_id, p.location_id, p.floor_number, p.space_number, p.current_state, p.sensor_status, p.led_status, p.zone_code, p.pole_label, p.map_x, p.map_y, l.location_name AS location_name FROM ParkingSpaces p JOIN Locations l ON p.location_id = l.location_id";
    const params = [];

    const where = [];
    if (location_id) {
      where.push(`p.location_id = $${params.length + 1}`);
      params.push(location_id);
    }
    if (floor) {
      where.push(`p.floor_number = $${params.length + 1}`);
      params.push(floor);
    }

    if (where.length > 0) sql += " WHERE " + where.join(" AND ");
    sql += " ORDER BY p.location_id, p.floor_number, p.space_number";

    const result = await pool.query(sql, params);
    const rows = result.rows;
    res.json(Array.isArray(rows) ? rows : []);
  } catch (e) {
    res.status(500).json({ message: "Failed to load parking spaces", error: e.message });
  }
});

// --- สำหรับแอดมินเพิ่มช่องจอด ---
r.post("/", requireAuth, async (req, res) => {
  try {
    const { location_id, floor_number, space_number, zone_code, pole_label, map_x, map_y } = req.body;
    if (!location_id || !floor_number || !space_number) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    await pool.query(
      `INSERT INTO ParkingSpaces (location_id, floor_number, space_number, zone_code, pole_label, map_x, map_y, led_status, sensor_status, current_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'green','empty','available')`,
      [location_id, floor_number, space_number, zone_code || null, pole_label || null, map_x ?? null, map_y ?? null]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Failed to add parking space", error: e.message });
  }
});

// --- สำหรับ Node-RED / IoT อัปเดตสถานะ (รองรับระบบเซนเซอร์ใหม่) ---
r.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { current_state, sensor_status, led_status } = req.body;

    if (!current_state) {
      return res.status(400).json({ message: "Missing current_state" });
    }

    // ดึงสถานะก่อนหน้า
    const prevResult = await pool.query(
      "SELECT current_state FROM ParkingSpaces WHERE space_id=$1",
      [id]
    );
    const prev = prevResult.rows[0];

    // อัปเดตสถานะใหม่
    await pool.query(
      "UPDATE ParkingSpaces SET current_state=$1, sensor_status=$2, led_status=$3 WHERE space_id=$4",
      [current_state, sensor_status || null, led_status || null, id]
    );

    // บันทึกลงประวัติ
    await pool.query(
      `INSERT INTO SpaceStatusHistory (space_id, prev_state, new_state, sensor_status, led_status)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, prev?.current_state || null, current_state, sensor_status || null, led_status || null]
    );

    // Publish MQTT topic according to current_state
    const slotInfoResult = await pool.query(
      "SELECT space_number FROM ParkingSpaces WHERE space_id=$1",
      [id]
    );
    const slotInfo = slotInfoResult.rows[0];
    const slotNumber = slotInfo?.space_number;

    if (slotNumber) {
      if (current_state === "reserved") {
        mqttClient.publish(`smartparking/slot${slotNumber}/reservationStatus`, "reserved");
      } else if (current_state === "occupied") {
        mqttClient.publish(`smartparking/slot${slotNumber}/confirmedParkID`, "occupied");
      } else if (current_state === "unauthorized") {
        mqttClient.publish(`smartparking/slot${slotNumber}/alertStatus`, "ON");
      } else if (current_state === "available") {
        mqttClient.publish(`smartparking/slot${slotNumber}/alertStatus`, "OFF");
      }
    }

    // Auto check-in หากตรวจจับว่ามีรถเข้ามา
    if (current_state === "occupied") {
      const bookingResult = await pool.query(
        `SELECT reservation_id FROM Reservations
         WHERE space_id=$1 AND status='reserved'
         AND start_time <= NOW() AND end_time > NOW()
         ORDER BY start_time DESC LIMIT 1`,
        [id]
      );
      const booking = bookingResult.rows[0];

      if (booking) {
        await pool.query(
          "UPDATE Reservations SET status='checked-in', checked_in_at=COALESCE(checked_in_at, NOW()) WHERE reservation_id=$1",
          [booking.reservation_id]
        );
      }
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: "Failed to update space status", error: e.message });
  }
});

// --- ดึงภาพผังชั้นของสถานที่/ชั้น ---
r.get("/floorplan", async (req, res) => {
  try {
    const { location_id, floor } = req.query;
    if (!location_id || !floor) return res.status(400).json({ message: "location_id and floor are required" });
    const floorplanResult = await pool.query(
      `SELECT floorplan_id, image_url, width_px, height_px
       FROM FloorPlans
       WHERE location_id=$1 AND floor_number=$2
       ORDER BY floorplan_id DESC
       LIMIT 1`,
      [location_id, floor]
    );
    const row = floorplanResult.rows[0];
    if (!row) return res.status(404).json({ message: "Floor plan not found" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: "Failed to load floor plan", error: e.message });
  }
});

// --- สรุปจำนวนช่องจอดแต่ละสถานที่ (รวมสถานะ) ---
r.get("/summary", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.location_id, l.location_name AS location_name,
              COUNT(p.space_id) AS total_spaces,
              SUM(CASE WHEN p.current_state='available' THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN p.current_state='reserved' THEN 1 ELSE 0 END) AS reserved,
              SUM(CASE WHEN p.current_state='occupied' THEN 1 ELSE 0 END) AS occupied,
              SUM(CASE WHEN p.current_state='unauthorized' THEN 1 ELSE 0 END) AS unauthorized
       FROM Locations l
       LEFT JOIN ParkingSpaces p ON l.location_id=p.location_id
       GROUP BY l.location_id, l.location_name
       ORDER BY l.location_name`
    );
    const rows = result.rows;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to load summary", error: e.message });
  }
});

// --- ดึงจำนวนชั้นของแต่ละสถานที่ ---
r.get("/floors/:location_id", async (req, res) => {
  try {
    const { location_id } = req.params;
    const result = await pool.query(
      `SELECT DISTINCT floor_number FROM ParkingSpaces WHERE location_id=$1 ORDER BY CAST(floor_number AS INTEGER)`,
      [location_id]
    );
    const rows = result.rows;
    res.json(rows.map((r) => r.floor_number));
  } catch (e) {
    res.status(500).json({ message: "Failed to load floors", error: e.message });
  }
});

// --- ดึงรายละเอียดช่องจอดแต่ละช่อง ---
r.get("/:id/detail", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.space_id, p.location_id, l.location_name AS location_name, p.floor_number, p.space_number,
              p.current_state, p.sensor_status, p.led_status, p.zone_code, p.pole_label, p.map_x, p.map_y, p.created_at
       FROM ParkingSpaces p JOIN Locations l ON p.location_id=l.location_id WHERE p.space_id=$1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ message: "Space not found" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: "Failed to load space detail", error: e.message });
  }
});

// --- สรุปจำนวนช่องจอดรายสถานที่ + รายชั้น ---
r.get("/summary/floors", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.location_id, l.location_name AS location_name, p.floor_number,
              COUNT(p.space_id) AS total_spaces,
              SUM(CASE WHEN p.current_state='available' THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN p.current_state='reserved' THEN 1 ELSE 0 END) AS reserved,
              SUM(CASE WHEN p.current_state='occupied' THEN 1 ELSE 0 END) AS occupied,
              SUM(CASE WHEN p.current_state='unauthorized' THEN 1 ELSE 0 END) AS unauthorized
       FROM Locations l
       LEFT JOIN ParkingSpaces p ON l.location_id=p.location_id
       GROUP BY l.location_id, l.location_name, p.floor_number
       ORDER BY l.location_name, CAST(p.floor_number AS INTEGER)`
    );
    const rows = result.rows;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "Failed to load floor summary", error: e.message });
  }
});

export default r;