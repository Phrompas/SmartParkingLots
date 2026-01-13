import { pool } from "../../db.js";

// Get all users
export async function getAllUsers() {
  const result = await pool.query("SELECT * FROM users");
  return result.rows;
}

// Get user by email
export async function getUserByEmail(email) {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0];
}

// Get user by ID
export async function getUserById(id) {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0];
}

// Create a new user
export async function createUser(email, hashedPassword, role = "user") {
  const result = await pool.query(
    "INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING *",
    [email, hashedPassword, role]
  );
  return result.rows[0];
}
