import { Router } from "express";
import { pool } from "../db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const r = Router();

const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET;

const generateAccessToken = (user) => {
  return jwt.sign(
    { user_id: user.user_id, role: user.role },
    ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { user_id: user.user_id },
    REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" }
  );
};

// In-memory store for refresh tokens (for demo purposes; use DB or Redis in production)
let refreshTokens = new Set();

r.post("/register", async (req, res) => {
  try {
    let { username, password, email, birth_date } = req.body;
    username = (username || "").trim();
    email = (email || "").trim();
    birth_date = birth_date || null; // optional, format YYYY-MM-DD

    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, message: "Missing username, email or password" });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: "Password must be at least 6 characters" });
    }

    // Check if user already exists
    const { rows: existingUsers } = await pool.query(
      "SELECT user_id FROM users WHERE username=$1 OR email=$2",
      [username, email]
    );
    if (existingUsers.length > 0) {
      return res.status(400).json({ ok: false, message: "Username or email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password, email, birth_date) VALUES ($1, $2, $3, $4)",
      [username, hash, email, birth_date]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

r.post("/login", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const identifier = (email || username || "").trim();
    if (!identifier || !password) {
      return res.status(400).json({ message: "Missing email/username or password" });
    }

    // allow login by email OR username
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE username=$1 OR email=$1 LIMIT 1",
      [identifier]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ message: "User not found" });

    let passwordMatches = false;

    if (user.password) {
      // Try bcrypt hash compare first
      passwordMatches = await bcrypt.compare(password, user.password);
      if (!passwordMatches) {
        // Legacy plaintext check fallback
        passwordMatches = user.password === password;
        if (passwordMatches) {
          // Upgrade to hashed password
          const newHash = await bcrypt.hash(password, 10);
          await pool.query(
            "UPDATE users SET password=$1 WHERE user_id=$2",
            [newHash, user.user_id]
          );
        }
      }
    } else {
      return res.status(401).json({ message: "Invalid user credentials" });
    }

    if (!passwordMatches) return res.status(401).json({ message: "Wrong password" });

    const access_token = generateAccessToken(user);
    const refresh_token = generateRefreshToken(user);

    refreshTokens.add(refresh_token);

    res.json({
      access_token,
      refresh_token,
      user: {
        id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        birth_date: user.birth_date || null,
      }
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

r.post("/refresh", (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(401).json({ message: "Missing refresh token" });
  if (!refreshTokens.has(refresh_token)) return res.status(403).json({ message: "Invalid refresh token" });

  jwt.verify(refresh_token, REFRESH_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid refresh token" });

    const user_id = decoded.user_id;

    pool.query("SELECT * FROM users WHERE user_id=$1 LIMIT 1", [user_id])
      .then(({ rows }) => {
        if (rows.length === 0) return res.status(404).json({ message: "User not found" });

        const user = rows[0];
        const access_token = generateAccessToken(user);
        res.json({ access_token });
      })
      .catch(() => res.status(500).json({ message: "Internal server error" }));
  });
});

r.post("/logout", (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ message: "Missing refresh token" });
  refreshTokens.delete(refresh_token);
  res.json({ message: "Logged out" });
});

r.get("/me", (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Missing token" });

  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Invalid token" });

    const user_id = decoded.user_id;

    pool.query("SELECT user_id, username, email, role, birth_date FROM users WHERE user_id=$1 LIMIT 1", [user_id])
      .then(({ rows }) => {
        if (rows.length === 0) return res.status(404).json({ message: "User not found" });

        const user = rows[0];
        res.json({
          id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
          birth_date: user.birth_date || null,
        });
      })
      .catch(() => res.status(500).json({ message: "Internal server error" }));
  });
});

export default r;