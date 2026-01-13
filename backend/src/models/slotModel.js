import { pool } from '../db.js';

export const getAllSlots = async () => {
  const result = await pool.query('SELECT * FROM slots ORDER BY id');
  return result.rows;
};

export const getSlotById = async (slotId) => {
  const result = await pool.query('SELECT * FROM slots WHERE id = $1', [slotId]);
  return result.rows[0];
};

export const createSlot = async ({ name, status }) => {
  const result = await pool.query(
    'INSERT INTO slots (name, status) VALUES ($1, $2) RETURNING *',
    [name, status]
  );
  return result.rows[0];
};

export const updateSlotStatus = async (slotId, status) => {
  const result = await pool.query(
    'UPDATE slots SET status = $1 WHERE id = $2 RETURNING *',
    [status, slotId]
  );
  return result.rows[0];
};

export const deleteSlot = async (slotId) => {
  const result = await pool.query(
    'DELETE FROM slots WHERE id = $1 RETURNING *',
    [slotId]
  );
  return result.rows[0];
};
