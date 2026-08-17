const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createDatabase } = require(path.join(__dirname, '../database/postgres'));

async function main() {
  const db = createDatabase();
  try {
    await db.ready;
    console.log('Connected to DB');

    const tables = ['buses', 'routes', 'schedules', 'bookings', 'stopped_route_services'];
    for (const table of tables) {
      console.log(`\nColumns for table: ${table}`);
      const cols = await db.all(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = ?
        ORDER BY ordinal_position
      `, [table]);
      console.table(cols);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await db.close();
  }
}

main();
