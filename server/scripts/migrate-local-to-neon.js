/**
 * Migration Script: Copy all data from Local PostgreSQL -> Neon Cloud PostgreSQL
 */
require('dotenv').config();
const { Pool } = require('pg');

const localUrl = process.env.LOCAL_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/AI_busbooking_flatform';
const cloudUrl = process.env.DATABASE_URL || process.env.CLOUD_DATABASE_URL;

if (!cloudUrl || !cloudUrl.includes('neon.tech')) {
  console.error('❌ Cloud DATABASE_URL for Neon is missing in environment.');
  process.exit(1);
}

const localPool = new Pool({
  connectionString: localUrl,
  ssl: false
});

const cloudPool = new Pool({
  connectionString: cloudUrl,
  ssl: { rejectUnauthorized: false }
});

const TABLES_TO_MIGRATE = [
  'users',
  'user_otps',
  'user_preferences',
  'owners',
  'companies',
  'company_requests',
  'places',
  'place_requests',
  'routes',
  'route_requests',
  'buses',
  'stopped_route_services',
  'schedules',
  'seats',
  'bookings',
  'group_bookings',
  'seat_locks',
  'seat_reviews',
  'cancellation_rules',
  'deleted_places',
  'conversation_sessions',
  'admin_whitelist'
];

async function migrateTable(tableName) {
  console.log(`📦 Migrating table: ${tableName}...`);
  try {
    const { rows } = await localPool.query(`SELECT * FROM "${tableName}"`);
    if (!rows || rows.length === 0) {
      console.log(`   ℹ️  Local table "${tableName}" is empty. Skipped.`);
      return;
    }

    const columns = Object.keys(rows[0]);
    const colNames = columns.map(c => `"${c}"`).join(', ');

    let insertedCount = 0;
    for (const row of rows) {
      const values = columns.map(c => row[c]);
      const paramPlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      const query = `
        INSERT INTO "${tableName}" (${colNames})
        VALUES (${paramPlaceholders})
        ON CONFLICT DO NOTHING;
      `;
      await cloudPool.query(query, values);
      insertedCount++;
    }

    // Reset sequence if table has serial 'id'
    if (columns.includes('id')) {
      await cloudPool.query(`
        SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1), true);
      `).catch(() => {});
    }

    console.log(`   ✅ Migrated ${insertedCount} rows into "${tableName}" on Neon.`);
  } catch (error) {
    if (error.message.includes('does not exist')) {
      console.log(`   ⚠️ Table "${tableName}" does not exist in local database. Skipped.`);
    } else {
      console.error(`   ❌ Error migrating "${tableName}": ${error.message}`);
    }
  }
}

async function runMigration() {
  console.log('🚀 Starting Data Migration: Local PostgreSQL ➡️ Neon Cloud PostgreSQL');
  console.log(`   Local Source: ${localUrl.split('@')[1] || localUrl}`);
  console.log(`   Cloud Target: ${cloudUrl.split('@')[1] || cloudUrl}`);
  console.log('------------------------------------------------------------');

  for (const table of TABLES_TO_MIGRATE) {
    await migrateTable(table);
  }

  console.log('------------------------------------------------------------');
  console.log('🎉 Data Migration Complete! All local data is now in your Neon Cloud Database.');
  await localPool.end();
  await cloudPool.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
