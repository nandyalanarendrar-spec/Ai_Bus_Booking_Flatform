require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const cloudUrl = process.env.DATABASE_URL;

if (!cloudUrl) {
  console.error('❌ DATABASE_URL is missing in server/.env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: cloudUrl,
  ssl: cloudUrl.includes('localhost') || cloudUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
});

async function setupOwner() {
  try {
    const email = 'nandyalanarendrar@gmail.com';
    const rawPassword = 'n@rendra-16';
    const name = 'Platform Owner';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Ensure owner table has active owner record
    await pool.query('DELETE FROM owners WHERE email = $1', [email]);
    await pool.query(
      'INSERT INTO owners (email, password, name, is_active) VALUES ($1, $2, $3, 1)',
      [email, hashedPassword, name]
    );

    console.log('✅ Owner Account Updated Successfully!');
    console.log(`   📧 Email: ${email}`);
    console.log(`   🔑 Password: ${rawPassword}`);
  } catch (err) {
    console.error('❌ Error configuring owner account:', err.message);
  } finally {
    await pool.end();
  }
}

setupOwner();
