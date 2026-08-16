require('dotenv').config();
const { Pool } = require('pg');

const cloudUrl = process.env.DATABASE_URL;

if (!cloudUrl) {
  console.error('❌ DATABASE_URL is missing in environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: cloudUrl,
  ssl: cloudUrl.includes('localhost') || cloudUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
});

async function verifyAllUsers() {
  try {
    const res = await pool.query('UPDATE users SET verified = 1');
    console.log(`✅ Success! All registered users (including "narendra") are now verified! (Updated ${res.rowCount} row(s)).`);
  } catch (err) {
    console.error('❌ Error verifying users:', err.message);
  } finally {
    await pool.end();
  }
}

verifyAllUsers();
