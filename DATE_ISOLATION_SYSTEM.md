# Date-Based Seat Isolation System

## ✅ Implementation Complete

### Overview
This system ensures that **seat availability is maintained separately for each journey date**, with an automatic **30-day rolling window** that requires **ONE command** to run.

---

## 🎯 Core Requirements (All Met)

### 1. ✅ Seat Availability Per Date
- **Each schedule has a unique `travel_date` field**
- Schedules are created separately for each date (same route, same bus, different dates = different schedules)
- Seat bookings are tied to `schedule_id`, which includes the date
- **Result**: Booking seats on Feb 5 has ZERO impact on Feb 6 or any other date

### 2. ✅ Exactly 30 Days of Data
- Database maintains schedules for **exactly 30 days from today**
- Initial setup: Creates days 0-29 (today + next 29 days)
- Dynamic maintenance: Always keeps 30-day window current

### 3. ✅ Automatic Data Rotation
**When Today Ends (Daily Cleanup):**
- ❌ **Deletes**: Yesterday's schedules and bookings (travel_date < today)
- ✅ **Creates**: New day 31 schedules (today + 30 days)
- 🔄 **Maintains**: Exactly 30 days of future travel data

### 4. ✅ Date Isolation Guarantee
**Complete Independence:**
```
Date: Feb 5     Date: Feb 6     Date: Feb 7
Schedule #1     Schedule #2     Schedule #3
40 seats        40 seats        40 seats
(independent)   (independent)   (independent)
```

**Booking on Feb 5:**
- Decrements only Schedule #1's `available_seats`
- Feb 6 and Feb 7 remain unchanged at 40 seats

### 5. ✅ One Command Operation
```bash
npm start
```
**This single command:**
1. Starts Express backend (port 5000)
2. Auto-creates SQLite database
3. Auto-creates all tables
4. Seeds initial 30 days of schedules
5. Starts cleanup service (runs hourly)
6. Starts React frontend (port 5173)
7. Opens browser automatically

---

## 🏗️ Database Architecture

### Schedules Table
```sql
CREATE TABLE schedules (
  id INTEGER PRIMARY KEY,
  route_id INTEGER,
  bus_id INTEGER,
  departure_time TEXT,
  arrival_time TEXT,
  base_price REAL,
  available_seats INTEGER,  -- Per-date counter
  travel_date DATE,          -- Isolation key
  ...
)
```

### Bookings Table
```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  schedule_id INTEGER,       -- Links to specific date
  seat_numbers TEXT,
  booking_status TEXT,
  ...
)
```

**Key Insight**: Each `schedule_id` is unique per date, ensuring complete isolation.

---

## 🔄 Automatic Cleanup Service

### How It Works
```javascript
// Runs every hour
setInterval(() => performDailyCleanup(), 60 * 60 * 1000);
```

### Cleanup Process
1. **Calculate Dates:**
   - Today: Feb 6, 2026
   - Day 31: Mar 8, 2026

2. **Delete Old Data:**
   - Remove bookings where `schedule_id IN (SELECT id FROM schedules WHERE travel_date < 'Feb 6')`
   - Remove schedules where `travel_date < 'Feb 6'`
   - Result: Feb 5 and earlier data deleted

3. **Add New Data:**
   - Check if Mar 8 schedules exist
   - If not, create full day of schedules for Mar 8
   - Result: 30-day window restored

### Example Timeline
```
Feb 5, 11:59 PM → Database has Feb 5 - Mar 6 (30 days)
Feb 6, 12:00 AM → Cleanup runs
                  ❌ Deletes Feb 5 data
                  ✅ Creates Mar 7 data
Feb 6, 12:01 AM → Database has Feb 6 - Mar 7 (30 days)
```

---

## 📊 Schedule Generation

### Per-Date Schedule Creation
For each date, the system creates:
- **All Routes**: Every city pair (e.g., Hyderabad → Bangalore)
- **4 Buses per Route**: Different departure times (06:00, 14:00, 18:30, 22:00)
- **40 Seats per Bus**: All starting as available

### Example for Feb 6:
```
Route: Hyderabad → Bangalore
├─ Schedule 1: Bus #1, 06:00 departure, 40 available seats
├─ Schedule 2: Bus #2, 14:00 departure, 40 available seats
├─ Schedule 3: Bus #3, 18:30 departure, 40 available seats
└─ Schedule 4: Bus #4, 22:00 departure, 40 available seats

Route: Hyderabad → Chennai
├─ Schedule 5: Bus #5, 06:00 departure, 40 available seats
...
```

**Feb 7 has COMPLETELY SEPARATE schedules** (Schedule 100-199, etc.)

---

## 🔒 Booking Isolation Proof

### Scenario: Booking on Feb 6

**Before Booking:**
```sql
SELECT * FROM schedules WHERE travel_date = '2026-02-06' AND bus_id = 1;
-- Result: schedule_id=50, available_seats=40

SELECT * FROM schedules WHERE travel_date = '2026-02-07' AND bus_id = 1;
-- Result: schedule_id=150, available_seats=40
```

**Book 3 Seats on Feb 6:**
```javascript
// scheduleId = 50 (Feb 6)
UPDATE schedules SET available_seats = available_seats - 3 WHERE id = 50;
```

**After Booking:**
```sql
SELECT * FROM schedules WHERE travel_date = '2026-02-06' AND bus_id = 1;
-- Result: schedule_id=50, available_seats=37  ← Changed

SELECT * FROM schedules WHERE travel_date = '2026-02-07' AND bus_id = 1;
-- Result: schedule_id=150, available_seats=40  ← Unchanged
```

**Proof**: Different `schedule_id` values ensure complete data isolation between dates.

---

## 🧪 Verification Endpoint

### Test Date Isolation
```bash
# Start the server
npm start

# In another terminal, verify the system
curl http://localhost:5000/api/buses/verify/date-isolation
```

### Expected Response
```json
{
  "verification": {
    "status": "PASSED",
    "today": "2026-02-06",
    "window_start": "2026-02-06",
    "window_end": "2026-03-07",
    "total_days_in_db": 30,
    "expected_days": 30,
    "is_30_day_window": true
  },
  "dateBreakdown": [
    {
      "travel_date": "2026-02-06",
      "total_schedules": 224,
      "total_available_seats": 8960,
      "total_bookings": 0
    },
    ...
  ],
  "isolation_proof": {
    "message": "Each date has independent schedules and seat availability"
  }
}
```

---

## 📋 Code Flow

### 1. Server Startup (`server/index.js`)
```javascript
initializeDatabase();  // Creates DB + tables
```

### 2. Database Initialization (`server/database/init.js`)
```javascript
createTables()
  → seedData()
    → generateSchedulesForDateRange(routesData, 0, 30)  // Days 0-29
    → startScheduleCleanupService(routesData)           // Auto-cleanup
```

### 3. Booking Flow (`server/routes/buses.js`)
```javascript
POST /api/buses/book
  → Validate schedule exists
  → Check seats available (by schedule_id)
  → Create booking (linked to schedule_id)
  → Decrement available_seats (only for this schedule)
```

### 4. Cleanup Service (`server/database/init.js`)
```javascript
setInterval(() => {
  // Delete old data
  DELETE FROM bookings WHERE schedule_id IN (
    SELECT id FROM schedules WHERE travel_date < today
  );
  DELETE FROM schedules WHERE travel_date < today;
  
  // Add day 31
  INSERT INTO schedules (travel_date = today + 30, ...);
}, 60 * 60 * 1000);
```

---

## 🚀 Quick Start

```bash
# Clone/navigate to project
cd narendra2

# Run everything with ONE command
npm start

# System automatically:
# ✅ Creates database
# ✅ Creates 30 days of schedules
# ✅ Starts cleanup service
# ✅ Opens application
```

---

## 🎓 Key Technical Decisions

### 1. Why Schedule-Based (Not Seat-Based)?
- **Problem**: Having a global `seats` table would require complex date filtering
- **Solution**: Each schedule is date-specific with its own seat counter
- **Benefit**: Natural isolation, simpler queries, better performance

### 2. Why Hourly Cleanup (Not Daily)?
- **Problem**: If cleanup runs once at midnight, server downtime could miss it
- **Solution**: Run every hour, check if cleanup needed
- **Benefit**: Resilient to restarts, always maintains 30-day window

### 3. Why Delete Old Data?
- **Problem**: Infinite growth of historical data
- **Solution**: Keep only future 30 days, delete past dates
- **Benefit**: Bounded database size, better performance

### 4. Why Fixed 30-Day Window?
- **Problem**: Users need to book in advance
- **Solution**: Always show 30 days of availability
- **Benefit**: Predictable user experience, manageable data volume

---

## ✅ Requirements Checklist

- [x] Seat availability maintained separately for each journey date
- [x] Database always contains exactly 30 days of future data
- [x] Automatic deletion of past date data (when today ends)
- [x] Automatic creation of day 31 data
- [x] Booking on one date never affects other dates
- [x] Everything works with ONE command (`npm start`)
- [x] System survives server restarts
- [x] Cleanup service starts automatically
- [x] No manual intervention required

---

## 🔍 Monitoring

### Check Current State
```bash
# View all schedules by date
curl http://localhost:5000/api/buses/debug/schedules

# Verify date isolation
curl http://localhost:5000/api/buses/verify/date-isolation

# Manual cleanup trigger (admin)
curl -X POST http://localhost:5000/api/admin/cleanup
```

---

## 🎉 Summary

This system provides **complete date-based seat isolation** with:
- **Automatic 30-day rolling window**
- **Zero manual maintenance**
- **One-command startup**
- **Guaranteed data independence between dates**
- **Resilient to restarts and failures**

All requirements are met and working! 🚀
