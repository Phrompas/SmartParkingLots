import { pool } from '../../db.js';

export async function createBooking(user_id, space_id, start_time, end_time) {
  const result = await pool.query(
    `INSERT INTO bookings (user_id, space_id, start_time, end_time)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, space_id, start_time, end_time]
  );
  return result.rows[0];
}

export async function getBookingById(booking_id) {
  const result = await pool.query(
    `SELECT * FROM bookings WHERE id = $1`,
    [booking_id]
  );
  return result.rows[0];
}

export async function getBookingsByUserId(user_id) {
  const result = await pool.query(
    `SELECT * FROM bookings WHERE user_id = $1 ORDER BY start_time DESC`,
    [user_id]
  );
  return result.rows;
}

export async function updateBookingStatus(booking_id, status) {
  const result = await pool.query(
    `UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *`,
    [status, booking_id]
  );
  return result.rows[0];
}

export async function deleteBooking(booking_id) {
  await pool.query(
    `DELETE FROM bookings WHERE id = $1`,
    [booking_id]
  );
}
