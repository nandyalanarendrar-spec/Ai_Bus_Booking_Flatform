const { createDatabase } = require('./database/postgres');

async function main() {
  const db = createDatabase();

  try {
    await db.ready;

    const rows = await db.all(`
      SELECT s.id, r.from_city, r.to_city, s.departure_time, s.base_price, b.rating
      FROM schedules s
      JOIN routes r ON s.route_id = r.id
      JOIN buses b ON s.bus_id = b.id
      LIMIT 20
    `);

    console.log('--- DATABASE VARIATION CHECK ---');
    console.table(rows);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

main();
