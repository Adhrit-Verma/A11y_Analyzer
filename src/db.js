// src/db.js
const { Pool } = require("pg");

// Render gives DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

// Render Postgres often requires SSL for external connections.
// This config works on Render and locally (if you set DATABASE_URL).
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
