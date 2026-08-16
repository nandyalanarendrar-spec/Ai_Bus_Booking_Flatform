require('dotenv').config();
const { Pool } = require('pg');

const cloudUrl = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString: cloudUrl,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query('SELECT id, email, is_active FROM owners');
    console.log('📊 Current Owners in Neon Database:', res.rows);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
