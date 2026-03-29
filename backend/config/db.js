// backend/config/db.js
const { Pool } = require("pg");

const pool = new Pool({
  user: "root",
  host: "localhost",
  database: "role_distributor",
  password: "password123",
  port: 5432,
});

pool.query("SELECT NOW()", async (err, res) => {
  if (!err) {
    console.log("PostgreSQL database connected successfully.");
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255),
            is_guest BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (tableErr) {
      console.error("Failed to create table:", tableErr);
    }
  }
});

module.exports = pool;
