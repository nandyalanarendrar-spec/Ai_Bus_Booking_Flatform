require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const cloudUrl = process.env.DATABASE_URL;

if (!cloudUrl) {
  console.error('❌ DATABASE_URL missing in server/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: cloudUrl,
  ssl: cloudUrl.includes('localhost') || cloudUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
});

async function createOrResetNarendra() {
  try {
    const hashedPassword = await bcrypt.hash('123456', 10);
    const username = 'narendra';
    const email = 'narendra@example.com';

    const checkRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (checkRes.rows.length > 0) {
      await pool.query('UPDATE users SET password = $1, verified = 1 WHERE username = $2', [hashedPassword, username]);
      console.log('✅ User "narendra" password updated to 123456 and email set to VERIFIED!');
    } else {
      await pool.query(
        'INSERT INTO users (username, email, password, verified) VALUES ($1, $2, $3, 1)',
        [username, email, hashedPassword]
      );
      console.log('✅ User "narendra" successfully created with password 123456 and email VERIFIED!');
    }
  } catch (err) {
    console.error('❌ Error updating user:', err.message);
  } finally {
    await pool.end();
  }
}

createOrResetNarendra();
