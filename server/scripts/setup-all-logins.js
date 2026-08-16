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

async function setupAllAccounts() {
  console.log('🚀 Synchronizing all platform login accounts...');

  try {
    const userPass = await bcrypt.hash('123456', 10);
    const ownerPass = await bcrypt.hash('n@rendra-16', 10);

    // 1. Customer User
    await pool.query(`
      INSERT INTO users (username, email, password, verified)
      VALUES ('narendra', 'narendra@example.com', $1, 1)
      ON CONFLICT (username) 
      DO UPDATE SET password = EXCLUDED.password, verified = 1;
    `, [userPass]);
    console.log('  ✅ Customer Account: username="narendra", password="123456"');

    // 2. Platform Owner
    await pool.query(`
      INSERT INTO owners (email, password, name, is_active)
      VALUES ('nandyalanarendrar@gmail.com', $1, 'Platform Owner', 1)
      ON CONFLICT (email) 
      DO UPDATE SET password = EXCLUDED.password, is_active = 1;
    `, [ownerPass]);
    console.log('  ✅ Platform Owner: email="nandyalanarendrar@gmail.com", password="n@rendra-16"');

    // 3. Default Bus Owner Companies
    const companies = [
      { name: 'VRL Travels', email: 'vrl@travels.com', pass: 'vrl123' },
      { name: 'RedBus Fleet', email: 'redbus@fleet.com', pass: 'redfleet123' },
      { name: 'Kaveri Travels', email: 'kaveri@travels.com', pass: 'kaveri123' },
      { name: 'Orange Travels', email: 'orange@travels.com', pass: 'orange123' }
    ];

    for (const comp of companies) {
      const compHash = await bcrypt.hash(comp.pass, 10);
      await pool.query(`
        INSERT INTO companies (name, email, password, password_hash, company_name, is_active, status)
        VALUES ($1, $2, $3, $3, $1, 1, 'ACTIVE')
        ON CONFLICT (email) 
        DO UPDATE SET password = EXCLUDED.password, password_hash = EXCLUDED.password, is_active = 1, status = 'ACTIVE';
      `, [comp.name, comp.email, compHash]);
      console.log(`  ✅ Company Account: email="${comp.email}", password="${comp.pass}"`);
    }

    console.log('------------------------------------------------------------');
    console.log('🎉 All platform accounts ready for login!');
  } catch (err) {
    console.error('❌ Setup error:', err.message);
  } finally {
    await pool.end();
  }
}

setupAllAccounts();
