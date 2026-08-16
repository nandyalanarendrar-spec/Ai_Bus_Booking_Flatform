const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'database', 'app.db');
const db = new sqlite3.Database(dbPath);

db.all(`
  SELECT s.id, r.from_city, r.to_city, s.departure_time, s.base_price, b.rating 
  FROM schedules s 
  JOIN routes r ON s.route_id = r.id 
  JOIN buses b ON s.bus_id = b.id 
  LIMIT 20
`, (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.table(rows);
  db.close();
});
