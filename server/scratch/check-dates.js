const { getDatabase } = require('../database/init');
const { getLocalDateString } = require('../utils/dateUtils');

const db = getDatabase();
setTimeout(() => {
  db.get(`
    SELECT 
      MIN(travel_date) as min_date,
      MAX(travel_date) as max_date,
      COUNT(DISTINCT travel_date) as total_days,
      COUNT(*) as total_schedules
    FROM schedules
  `, (err, row) => {
    console.log('--- CURRENT DB SCHEDULE DATES ---');
    console.log('Today (Local):', getLocalDateString());
    console.log('Min travel_date:', row?.min_date);
    console.log('Max travel_date:', row?.max_date);
    console.log('Total days:', row?.total_days);
    console.log('Total schedules:', row?.total_schedules);
    process.exit(0);
  });
}, 1500);
