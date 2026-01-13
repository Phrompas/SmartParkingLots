import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.PG_HOST || process.env.DB_HOST,
  user: process.env.PG_USER || process.env.DB_USER,
  password: process.env.PG_PASS || process.env.DB_PASS,
  database: process.env.PG_DATABASE || process.env.DB_NAME,
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432,
});

const query = (text, params = []) => pool.query(text, params);

async function init() {
  try {
    const client = await pool.connect();
    try {
      await client.query("SET TIME ZONE 'Asia/Bangkok'");
      console.log(
        "[DB] Connected to",
        client.host || process.env.PG_HOST || process.env.DB_HOST,
        "DB:",
        client.database || process.env.PG_DATABASE || process.env.DB_NAME
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[DB] Connection error:", err.message);
  }
}

init().catch(console.error);

export { pool, query };