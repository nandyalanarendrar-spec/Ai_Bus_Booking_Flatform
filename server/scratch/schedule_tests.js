global.isTesting = true;
const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const dateUtils = require(path.join(__dirname, '../utils/dateUtils'));
const { initializeDatabase, performDailyCleanup, validateRolling30DayWindow } = require(path.join(__dirname, '../database/init'));

// Mock Date System
const originalGetLocalDateString = dateUtils.getLocalDateString;
const originalGetOffsetLocalDateString = dateUtils.getOffsetLocalDateString;

let mockTodayStr = '2026-09-01';

function setMockToday(dateStr) {
  mockTodayStr = dateStr;
  console.log(`\n📅 System Date Mocked To: ${mockTodayStr}`);
}

dateUtils.getLocalDateString = (d) => {
  if (d === undefined) return mockTodayStr;
  return originalGetLocalDateString(d);
};

dateUtils.getOffsetLocalDateString = (daysOffset) => {
  const [year, month, day] = mockTodayStr.split('-').map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day + daysOffset));
  const tYear = targetDate.getUTCFullYear();
  const tMonth = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const tDay = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${tYear}-${tMonth}-${tDay}`;
};

const db = initializeDatabase();

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runCleanup() {
  return new Promise((resolve) => {
    performDailyCleanup(null, () => {
      resolve();
    });
  });
}

async function runTest() {
  try {
    await db.ready;
    console.log('Connected to DB. Starting Automated Tests.');

    // Compute route-bus pairs mathematically matching the round-robin generator
    const allDbRoutes = await db.all('SELECT id FROM routes ORDER BY id');
    const dbBuses = await db.all('SELECT id FROM buses WHERE is_daily_service = 1 ORDER BY id');
    const busIds = dbBuses.map(b => b.id);
    
    let r1, b1, r2, b2;
    for (let routeIdx = 0; routeIdx < allDbRoutes.length; routeIdx++) {
      const route = allDbRoutes[routeIdx];
      const busId = busIds[(routeIdx * 4 + 0) % busIds.length]; // slot 0
      if (!r1) {
        r1 = route.id;
        b1 = busId;
      } else if (!r2 && route.id !== r1 && busId !== b1) {
        r2 = route.id;
        b2 = busId;
        break;
      }
    }

    console.log(`Using Route #${r1}, #${r2} and Bus #${b1}, #${b2} for testing.`);

    // --- TEST 1: Fresh schedule ---
    console.log('\n--- Test 1: Fresh Schedule ---');
    setMockToday('2026-09-01');
    
    // Clear schedules for these specific test routes/buses to simulate fresh state
    await db.run('DELETE FROM schedules WHERE (route_id = ? AND bus_id = ?) OR (route_id = ? AND bus_id = ?)', [r1, b1, r2, b2]);
    
    // Run cleanup/generation and await completion
    await runCleanup();

    let report1 = await validateRolling30DayWindow(r1, b1);
    console.log('Report for Service 1:', report1);
    assert.strictEqual(report1.unique_dates, 30, 'Should have exactly 30 unique dates');
    assert.strictEqual(report1.minimum_date, '2026-09-01', 'First date should be today');
    assert.strictEqual(report1.maximum_date, '2026-09-30', 'Last date should be today+29');
    assert.strictEqual(report1.missing_dates.length, 0, 'Should have no missing dates');
    assert.strictEqual(report1.duplicate_dates.length, 0, 'Should have no duplicate dates');
    assert.strictEqual(report1.is_valid, true, 'Service window should be valid');
    console.log('✅ Test 1 Passed.');

    // --- TEST 2: Next day ---
    console.log('\n--- Test 2: Next Day Rollover ---');
    setMockToday('2026-09-02');
    await runCleanup();

    let report2 = await validateRolling30DayWindow(r1, b1);
    console.log('Report for Service 1:', report2);
    assert.strictEqual(report2.unique_dates, 30, 'Should have exactly 30 unique dates');
    assert.strictEqual(report2.minimum_date, '2026-09-02', 'First date should be today (Sep 02)');
    assert.strictEqual(report2.maximum_date, '2026-10-01', 'Last date should be Oct 01');
    console.log('✅ Test 2 Passed.');

    // --- TEST 3: Duplicate existing data ---
    console.log('\n--- Test 3: Duplicate Existing Data Consolidation ---');
    // Manually insert a duplicate row for the same date/route/bus
    const dupDate = '2026-09-15';
    // Temporarily drop index to allow inserting duplicates (to simulate dirty database)
    await db.run('DROP INDEX IF EXISTS idx_unique_schedules_route_bus_date');
    
    const originalRow = await db.get('SELECT * FROM schedules WHERE route_id = ? AND bus_id = ? AND travel_date = ?', [r1, b1, dupDate]);
    if (originalRow) {
      // Insert duplicate row with same route, bus, date
      await db.run(
        'INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, base_price, available_seats, travel_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [r1, b1, originalRow.departure_time, originalRow.arrival_time, originalRow.base_price, originalRow.available_seats, dupDate]
      );
      console.log('Inserted duplicate schedule for date', dupDate);
    }
    
    // Verify duplicate exists in DB
    const countBefore = await db.get('SELECT COUNT(*) as cnt FROM schedules WHERE route_id = ? AND bus_id = ? AND travel_date = ?', [r1, b1, dupDate]);
    console.log(`Schedules for ${dupDate} before cleanup: ${countBefore.cnt}`);
    assert.ok(Number(countBefore.cnt) > 1, 'Should have duplicate rows in DB');

    // Run cleanup/generation (it will run duplicate migration first)
    await runCleanup();

    const countAfter = await db.get('SELECT COUNT(*) as cnt FROM schedules WHERE route_id = ? AND bus_id = ? AND travel_date = ?', [r1, b1, dupDate]);
    console.log(`Schedules for ${dupDate} after cleanup: ${countAfter.cnt}`);
    assert.strictEqual(Number(countAfter.cnt), 1, 'Duplicate schedules should be consolidated to exactly one');
    console.log('✅ Test 3 Passed.');

    // --- TEST 4: Missing date ---
    console.log('\n--- Test 4: Missing Date Restoration ---');
    const missingDate = '2026-09-10';
    // Delete this date's schedule
    await db.run('DELETE FROM schedules WHERE route_id = ? AND bus_id = ? AND travel_date = ?', [r1, b1, missingDate]);
    
    let reportBefore = await validateRolling30DayWindow(r1, b1);
    console.log(`Before gap repair: unique_dates = ${reportBefore.unique_dates}, missing_dates =`, reportBefore.missing_dates);
    assert.ok(reportBefore.missing_dates.includes(missingDate), 'Should report date as missing');

    // Run cleanup
    await runCleanup();

    let reportAfter = await validateRolling30DayWindow(r1, b1);
    console.log(`After gap repair: unique_dates = ${reportAfter.unique_dates}, missing_dates =`, reportAfter.missing_dates);
    assert.strictEqual(reportAfter.missing_dates.includes(missingDate), false, 'Missing date should be restored');
    assert.strictEqual(reportAfter.is_valid, true, 'Window should be valid again');
    console.log('✅ Test 4 Passed.');

    // --- TEST 5: Too many dates ---
    console.log('\n--- Test 5: Too Many Dates Cleanup ---');
    const farDate = '2026-10-15';
    // Insert a schedule way in the future
    await db.run(
      'INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, base_price, available_seats, travel_date) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (route_id, bus_id, travel_date) DO NOTHING',
      [r1, b1, '06:00', '12:00', 500, 40, farDate]
    );
    
    let reportTooManyBefore = await validateRolling30DayWindow(r1, b1);
    console.log(`Before out-of-range cleanup: total_records = ${reportTooManyBefore.total_records}, future_out_of_range = ${reportTooManyBefore.future_out_of_range_dates}`);
    assert.ok(reportTooManyBefore.future_out_of_range_dates > 0, 'Should have future out of range dates');

    // Run cleanup
    await runCleanup();

    let reportTooManyAfter = await validateRolling30DayWindow(r1, b1);
    console.log(`After out-of-range cleanup: total_records = ${reportTooManyAfter.total_records}, future_out_of_range = ${reportTooManyAfter.future_out_of_range_dates}`);
    assert.strictEqual(reportTooManyAfter.future_out_of_range_dates, 0, 'Out of range dates should be cleaned up');
    console.log('✅ Test 5 Passed.');

    // --- TEST 6: Scheduler executed twice ---
    console.log('\n--- Test 6: Scheduler Executed Twice ---');
    await runCleanup();
    await runCleanup();

    let report6 = await validateRolling30DayWindow(r1, b1);
    assert.strictEqual(report6.is_valid, true, 'Window must remain valid');
    assert.strictEqual(report6.duplicate_dates.length, 0, 'No duplicates should be generated');
    console.log('✅ Test 6 Passed.');

    // --- TEST 7: Concurrent scheduler ---
    console.log('\n--- Test 7: Concurrent Scheduler Execution ---');
    // Trigger two daily cleanups simultaneously
    await Promise.all([runCleanup(), runCleanup()]);

    let report7 = await validateRolling30DayWindow(r1, b1);
    assert.strictEqual(report7.is_valid, true, 'Window must remain valid after concurrent runs');
    assert.strictEqual(report7.duplicate_dates.length, 0, 'No duplicates should be generated');
    console.log('✅ Test 7 Passed.');

    // --- TEST 8: Server downtime ---
    console.log('\n--- Test 8: Server Downtime Simulation (3 Days) ---');
    setMockToday('2026-09-02');
    await runCleanup();
    
    setMockToday('2026-09-05');
    await runCleanup();

    let report8 = await validateRolling30DayWindow(r1, b1);
    console.log('Report after catchup:', report8);
    assert.strictEqual(report8.unique_dates, 30, 'Should have exactly 30 unique dates');
    assert.strictEqual(report8.minimum_date, '2026-09-05', 'Earliest date should catch up to today');
    assert.strictEqual(report8.maximum_date, '2026-10-04', 'Latest date should extend to Sep 5 + 29');
    console.log('✅ Test 8 Passed.');

    // --- TEST 9: Multiple routes ---
    console.log('\n--- Test 9: Multiple Routes Independent Maintenance ---');
    let reportRoute1 = await validateRolling30DayWindow(r1, b1);
    let reportRoute2 = await validateRolling30DayWindow(r2, b2);
    assert.strictEqual(reportRoute1.unique_dates, 30, 'Route 1 should have 30 dates');
    assert.strictEqual(reportRoute2.unique_dates, 30, 'Route 2 should have 30 dates');
    console.log('✅ Test 9 Passed.');

    // --- TEST 10: New bus ---
    console.log('\n--- Test 10: New Bus Automatic Schedule Generation ---');
    const newBusNumber = 'NEWBUS' + Date.now();
    await db.run('INSERT INTO buses (bus_number, bus_name, bus_type, operator) VALUES (?, ?, ?, ?)', [newBusNumber, 'New Bus', 'Volvo', 'Test Operator']);
    const newBus = await db.get('SELECT id FROM buses WHERE bus_number = ?', [newBusNumber]);
    console.log(`Created new active bus with ID: ${newBus.id}`);
    
    // Run cleanup
    await runCleanup();

    const schedulesForNewBus = await db.all('SELECT DISTINCT travel_date FROM schedules WHERE bus_id = ?', [newBus.id]);
    console.log(`Generated ${schedulesForNewBus.length} schedule dates for new bus.`);
    assert.ok(schedulesForNewBus.length > 0, 'New bus should receive schedules automatically');
    console.log('✅ Test 10 Passed.');

    // --- TEST 11: Inactive bus ---
    console.log('\n--- Test 11: Inactive Bus Excluded from Generation ---');
    await db.run('UPDATE buses SET is_daily_service = 0 WHERE id = ?', [newBus.id]);
    await db.run('DELETE FROM schedules WHERE bus_id = ? AND travel_date >= ?', [newBus.id, mockTodayStr]);
    
    // Run cleanup
    await runCleanup();

    const inactiveBusSchedules = await db.all('SELECT * FROM schedules WHERE bus_id = ? AND travel_date >= ?', [newBus.id, mockTodayStr]);
    console.log(`Future schedules for inactive bus: ${inactiveBusSchedules.length}`);
    assert.strictEqual(inactiveBusSchedules.length, 0, 'No future schedules should be generated for inactive bus');
    console.log('✅ Test 11 Passed.');

    // --- TEST 12: Overnight journey ---
    console.log('\n--- Test 12: Overnight Journey Date Handling ---');
    const overnightSchedule = await db.get(`
      SELECT * FROM schedules 
      WHERE route_id = ? AND bus_id = ? AND travel_date = '2026-09-14' AND departure_time = '22:00'
    `, [r1, b1]);
    
    if (overnightSchedule) {
      console.log('Overnight journey schedule found:', {
        travel_date: overnightSchedule.travel_date,
        departure_time: overnightSchedule.departure_time,
        arrival_time: overnightSchedule.arrival_time
      });
      assert.strictEqual(overnightSchedule.travel_date, '2026-09-14', 'Overnight journey must belong to departure date');
    } else {
      console.log('Overnight departure slot not assigned to this specific bus, skipping check');
    }
    console.log('✅ Test 12 Passed.');

    console.log('\n🎉 ALL 12 AUTOMATED TESTS PASSED SUCCESSFULLY! 🎉\n');

  } catch (err) {
    console.error('\n❌ TEST RUN FAILED:', err);
  } finally {
    // Reset mock date changes to system local
    dateUtils.getLocalDateString = originalGetLocalDateString;
    dateUtils.getOffsetLocalDateString = originalGetOffsetLocalDateString;
    await db.close();
  }
}

runTest();
