const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createDatabase } = require(path.join(__dirname, '../database/postgres'));

async function main() {
  const db = createDatabase();
  try {
    await db.ready;
    console.log('Connected to DB');

    // Check unique index on schedules
    const indices = await db.all(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'schedules'
    `);
    console.log('Indices on schedules table:');
    console.table(indices);

    // Check if there are any duplicate schedules by route_id, bus_id, travel_date
    const duplicates = await db.all(`
      SELECT route_id, bus_id, travel_date, COUNT(*) as cnt
      FROM schedules
      GROUP BY route_id, bus_id, travel_date
      HAVING COUNT(*) > 1
    `);
    console.log(`Found ${duplicates.length} duplicate (route_id, bus_id, travel_date) groups.`);
    if (duplicates.length > 0) {
      console.log('Sample duplicates:', duplicates.slice(0, 10));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await db.close();
  }
}

main();
