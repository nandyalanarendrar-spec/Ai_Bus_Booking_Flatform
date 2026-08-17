const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createDatabase } = require(path.join(__dirname, '../database/postgres'));
const { getLocalDateString } = require(path.join(__dirname, '../utils/dateUtils'));

async function main() {
  const db = createDatabase();
  try {
    await db.ready;
    console.log('Connected to Neon PG database.');

    const todayStr = getLocalDateString();
    console.log('Today (IST):', todayStr);

    // 1. Let's see general counts
    const generalCounts = await db.get(`
      SELECT 
        COUNT(*) as total_schedules,
        COUNT(DISTINCT travel_date) as unique_dates,
        MIN(travel_date) as min_date,
        MAX(travel_date) as max_date
      FROM schedules
    `);
    console.log('General counts:', generalCounts);

    // 2. Let's see all unique routes & buses
    const routes = await db.all('SELECT id, from_city, to_city FROM routes ORDER BY id');
    const buses = await db.all('SELECT id, bus_number, bus_name FROM buses ORDER BY id');
    console.log(`Found ${routes.length} routes and ${buses.length} buses.`);

    // 3. Find duplicate schedule dates (where same route_id, bus_id, travel_date, departure_time exist multiple times)
    const duplicates = await db.all(`
      SELECT route_id, bus_id, travel_date, departure_time, COUNT(*) as count
      FROM schedules
      GROUP BY route_id, bus_id, travel_date, departure_time
      HAVING COUNT(*) > 1
      ORDER BY travel_date, count DESC
    `);
    console.log(`Found ${duplicates.length} duplicate (route, bus, date, dep_time) groups:`, duplicates.slice(0, 10));

    // 4. Let's find if there are duplicate (route_id, bus_id, travel_date) but different departure times?
    const serviceSchedulesCount = await db.all(`
      SELECT route_id, bus_id, travel_date, COUNT(*) as count
      FROM schedules
      GROUP BY route_id, bus_id, travel_date
      ORDER BY count DESC
      LIMIT 10
    `);
    console.log('Top (route_id, bus_id, travel_date) schedule counts:', serviceSchedulesCount);

    // 5. Schedules before today (expired)
    const expiredSchedules = await db.all(`
      SELECT id, route_id, bus_id, travel_date, departure_time 
      FROM schedules 
      WHERE travel_date < ?
      ORDER BY travel_date
    `, [todayStr]);
    console.log(`Found ${expiredSchedules.length} schedules before today:`, expiredSchedules.slice(0, 10));

    // 6. Schedules beyond today + 29
    const targetEndDate = new Date();
    targetEndDate.setDate(targetEndDate.getDate() + 29);
    const maxAllowedDateStr = getLocalDateString(targetEndDate);
    console.log('Max allowed date in 30-day window (today + 29):', maxAllowedDateStr);

    const outOfWindowSchedules = await db.all(`
      SELECT id, route_id, bus_id, travel_date, departure_time
      FROM schedules
      WHERE travel_date > ?
      ORDER BY travel_date
    `, [maxAllowedDateStr]);
    console.log(`Found ${outOfWindowSchedules.length} schedules beyond today + 29:`, outOfWindowSchedules.slice(0, 10));

    // 7. Analysis of 30-day rolling window per active service
    const stoppedServices = await db.all('SELECT bus_id, route_id FROM stopped_route_services');
    const stoppedSet = new Set(stoppedServices.map(s => `${s.bus_id}_${s.route_id}`));

    const activeServicesInDb = await db.all(`
      SELECT DISTINCT route_id, bus_id 
      FROM schedules
    `);

    console.log('\n--- 30-DAY ROLLING WINDOW STATUS PER SERVICE ---');
    for (const service of activeServicesInDb) {
      const isStopped = stoppedSet.has(`${service.bus_id}_${service.route_id}`);
      
      const schedulesForService = await db.all(`
        SELECT id, travel_date, departure_time FROM schedules
        WHERE route_id = ? AND bus_id = ?
        ORDER BY travel_date, departure_time
      `, [service.route_id, service.bus_id]);

      const uniqueDates = [...new Set(schedulesForService.map(s => s.travel_date))].sort();
      const expiredCount = uniqueDates.filter(d => d < todayStr).length;
      const futureOutOfRangeCount = uniqueDates.filter(d => d > maxAllowedDateStr).length;
      const activeWindowDates = uniqueDates.filter(d => d >= todayStr && d <= maxAllowedDateStr);

      const missingDates = [];
      const expectedDates = [];
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        expectedDates.push(getLocalDateString(d));
      }
      
      expectedDates.forEach(expectedDate => {
        if (!activeWindowDates.includes(expectedDate)) {
          missingDates.push(expectedDate);
        }
      });

      console.log(`Service: Route ${service.route_id} -> Bus ${service.bus_id} ${isStopped ? '(STOPPED)' : '(ACTIVE)'}`);
      console.log(`  Total schedules: ${schedulesForService.length}`);
      console.log(`  Unique dates overall: ${uniqueDates.length}`);
      console.log(`  Active window dates (should be 30): ${activeWindowDates.length}`);
      console.log(`  Expired dates (< today): ${expiredCount}`);
      console.log(`  Future out of range (> today+29): ${futureOutOfRangeCount}`);
      console.log(`  Missing dates in active window:`, missingDates);
      
      const dateCounts = {};
      schedulesForService.forEach(s => {
        if (s.travel_date >= todayStr && s.travel_date <= maxAllowedDateStr) {
          dateCounts[s.travel_date] = (dateCounts[s.travel_date] || 0) + 1;
        }
      });
      const duplicatedDates = Object.entries(dateCounts).filter(([date, count]) => count > 1).map(([date, count]) => `${date} (${count} schedules)`);
      if (duplicatedDates.length > 0) {
        console.log(`  Duplicated dates in active window:`, duplicatedDates);
      }
    }

  } catch (err) {
    console.error('Error running diagnostics:', err);
  } finally {
    await db.close();
  }
}

main();
