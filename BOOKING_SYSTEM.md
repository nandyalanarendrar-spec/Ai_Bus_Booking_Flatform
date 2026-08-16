# 30-Day Rolling Window Booking System

## Overview
This bus booking system now implements a **30-day rolling window** for seat reservations. This means:
- Schedules are available for the next 30 days from today
- When a day completes (becomes the past), its data is automatically deleted
- A new day (day 31) is automatically added to maintain the 30-day window

## How It Works

### Initial Setup
When the database is first created:
1. Creates all necessary tables (users, routes, buses, schedules, bookings, etc.)
2. Seeds 56 routes connecting 8 major cities (Hyderabad, Vijayawada, Bangalore, Chennai, Mumbai, Pune, Delhi, Jaipur)
3. Seeds 25 buses with different types (Volvo, Sleeper, Semi-Sleeper, etc.)
4. **Generates schedules for the next 30 days only** (6,720 schedules = 56 routes × 4 buses × 30 days)
5. Starts automatic cleanup service

### Date-Specific Bookings
Each booking is tied to a specific travel date:
- **Schedules table** has a `travel_date` column (DATE type)
- **Bookings table** references a schedule via `schedule_id`
- When you book seats on a specific date, they are booked for THAT DATE ONLY
- Same bus, same route on different dates have separate seat availability

### Example Scenario
```
Today: February 5, 2026
Available dates: Feb 5 - March 6, 2026 (30 days)

Route: Hyderabad → Bangalore
Bus: VRL Travels Express (AP29TX1234)
Departure: 06:00

Seat availability:
- Feb 5: Seats S1, S2 available
- Feb 6: Seats S1, S2, S3 available (different day = fresh availability)
- Feb 7: All seats available
...
- March 6: All seats available
```

### Automatic Cleanup Service

#### How It Works
The cleanup service runs **every hour** and performs:

1. **Deletes old bookings**: Removes bookings for dates before today
2. **Deletes expired seat locks**: Removes seat locks that have expired
3. **Deletes old schedules**: Removes schedules for dates before today
4. **Adds day 31**: Creates new schedules for day 31 (if they don't exist)

#### Example
```
Today: February 5, 2026 (12:00 PM)
Current schedules: Feb 5 - March 6 (30 days)

When midnight passes (February 6, 2026 arrives):
Next cleanup (within 1 hour):
  - Delete: All Feb 5 schedules and bookings
  - Add: March 7 schedules (new day 31)
  
New range: Feb 6 - March 7 (30 days)
```

### Manual Cleanup (for testing)
You can manually trigger the cleanup process:

```bash
POST http://localhost:5000/api/admin/cleanup
```

This is useful for:
- Testing the cleanup functionality
- Emergency maintenance
- Simulating the passage of time

## Database Schema

### Schedules Table
```sql
CREATE TABLE schedules (
  id INTEGER PRIMARY KEY,
  route_id INTEGER,
  bus_id INTEGER,
  departure_time TEXT,
  arrival_time TEXT,
  base_price REAL,
  available_seats INTEGER,
  travel_date DATE,  -- ⭐ Key field for date-specific bookings
  created_at DATETIME
)
```

### Bookings Table
```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  schedule_id INTEGER,  -- ⭐ Links to specific date via schedule
  seat_numbers TEXT,
  passenger_name TEXT,
  passenger_age INTEGER,
  passenger_gender TEXT,
  total_price REAL,
  booking_status TEXT,
  pnr TEXT UNIQUE,
  created_at DATETIME
)
```

## API Endpoints

### Search Buses
```javascript
POST /api/buses/search
{
  "fromCity": "Hyderabad",
  "toCity": "Bangalore",
  "travelDate": "2026-02-10"  // ⭐ Specific date
}
```

### Get Seat Layout
```javascript
GET /api/buses/seats/:scheduleId
// Returns seats for that specific schedule (date)
```

### Book Seats
```javascript
POST /api/buses/book
{
  "scheduleId": 123,  // ⭐ Contains the date information
  "seatNumbers": ["S1", "S2"],
  "passengerName": "John Doe",
  "passengerAge": 30,
  "passengerGender": "Male"
}
```

### Debug - Check Schedule Range
```javascript
GET /api/buses/debug/schedules
// Returns:
{
  "summary": {
    "total_schedules": 6720,
    "earliest_date": "2026-02-05",
    "latest_date": "2026-03-06",
    "unique_dates": 30
  },
  "dateBreakdown": [
    { "travel_date": "2026-02-05", "count": 224 },
    { "travel_date": "2026-02-06", "count": 224 },
    ...
  ]
}
```

## Benefits

### 1. True Date-Specific Booking
- Book seats for ANY date within the 30-day window
- Same seat can be booked on different dates independently
- No confusion about which day's journey you're booking

### 2. Automatic Data Management
- Old data is automatically cleaned up
- Database doesn't grow indefinitely
- Always maintains exactly 30 days of schedules

### 3. Performance
- Limited dataset (30 days vs all history)
- Faster queries
- Reduced storage requirements

### 4. Scalability
- Can easily extend to more days if needed
- Can adjust cleanup frequency
- Can add more routes/buses without issues

## Configuration

### Adjust Rolling Window Size
In `server/database/init.js`, change the initial generation:
```javascript
// Generate initial 30 days of schedules
generateSchedulesForDateRange(routesData, 0, 30);  // Change 30 to desired days
```

And update the cleanup to add the appropriate day:
```javascript
// Calculate day 31 from today
const day31 = new Date(today);
day31.setDate(today.getDate() + 30);  // Change 30 to (desired_days)
```

### Adjust Cleanup Frequency
In `server/database/init.js`:
```javascript
// Run every hour
cleanupInterval = setInterval(() => {
  console.log('🔄 Running scheduled cleanup...');
  performDailyCleanup(routesData);
}, 60 * 60 * 1000);  // Change to desired interval in milliseconds
```

Examples:
- Every 30 minutes: `30 * 60 * 1000`
- Every 6 hours: `6 * 60 * 60 * 1000`
- Every day at midnight: Use a proper cron job library

## Testing the System

### Test 1: Book on Different Dates
1. Search for buses: Hyderabad → Bangalore on Feb 10
2. Book seat S1
3. Search for same route on Feb 11
4. Verify seat S1 is available (different date!)
5. Book seat S1 again
6. Check both bookings have different travel_date

### Test 2: Verify Date Range
```bash
curl http://localhost:5000/api/buses/debug/schedules
```
Should show:
- 30 unique dates
- Dates from today to today+29

### Test 3: Manual Cleanup
1. Note current date range
2. Trigger cleanup: `POST http://localhost:5000/api/admin/cleanup`
3. Check date range again
4. Verify old dates removed (if any) and new dates added

### Test 4: Booking Persistence
1. Book seats for tomorrow
2. Wait for automatic cleanup (or trigger manually)
3. Verify your booking still exists
4. Verify old bookings (past dates) are removed

## Troubleshooting

### Issue: Schedules not updating
**Solution**: Check if cleanup service is running
```javascript
// In server logs, you should see:
🔄 Starting schedule cleanup service (runs every hour)...
```

### Issue: Old bookings not deleted
**Solution**: Check foreign key constraints
- Bookings are deleted BEFORE schedules
- Seat locks are deleted based on expiry time

### Issue: Day 31 not being added
**Solution**: Check for existing schedules
```sql
SELECT COUNT(*) FROM schedules WHERE travel_date = '2026-03-07';
```
If count > 0, new schedules won't be added (prevents duplicates)

## Future Enhancements

### 1. Cancellation Refunds
Already implemented! Based on hours before departure:
- 48+ hours: 90% refund
- 24-48 hours: 75% refund
- 12-24 hours: 50% refund
- 6-12 hours: 25% refund
- <6 hours: No refund

### 2. Dynamic Pricing
Could add surge pricing based on:
- Seat availability
- Day of week
- Festival seasons
- Demand patterns

### 3. Route Analytics
Track popular routes and adjust:
- Number of buses
- Departure times
- Pricing strategy

### 4. Waitlist System
When seats are full, add waitlist functionality:
- Auto-upgrade on cancellations
- Priority based on booking time
- Notification system

## Summary

✅ **Date-Specific Booking**: Each booking is tied to a specific travel date
✅ **30-Day Rolling Window**: Always shows next 30 days
✅ **Automatic Cleanup**: Hourly cleanup of old data + addition of new dates
✅ **No Manual Intervention**: System maintains itself automatically
✅ **Scalable**: Can easily adjust days/frequency/routes
✅ **Clean Database**: No unlimited growth, always relevant data only

The system is now production-ready for date-specific seat bookings with automatic rolling window maintenance!
