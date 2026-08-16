# Backend Routes Documentation

## Overview
This document lists all backend API routes, their endpoints, functionality, and the seat freezing/booking mechanisms.

---

## 🔐 Authentication Routes (`/api/auth`)

### POST `/api/auth/register`
- **Purpose**: Register a new user
- **Auth Required**: No
- **Body**: `{ username, email, password, phone }`
- **Response**: User details + JWT token

### POST `/api/auth/login`
- **Purpose**: Login user
- **Auth Required**: No
- **Body**: `{ email, password }`
- **Response**: User details + JWT token

### GET `/api/auth/me`
- **Purpose**: Get current user profile
- **Auth Required**: Yes
- **Response**: User details

### POST `/api/auth/verify-email`
- **Purpose**: Verify email with OTP
- **Auth Required**: Yes
- **Body**: `{ otp }`
- **Response**: Success message

### POST `/api/auth/resend-otp`
- **Purpose**: Resend verification OTP
- **Auth Required**: Yes
- **Response**: Success message

---

## 🚌 Bus & Schedule Routes (`/api/buses`)

### GET `/api/buses/routes`
- **Purpose**: Get all available routes
- **Auth Required**: No
- **Response**: Array of routes with from/to cities

### GET `/api/buses/schedules`
- **Purpose**: Get all schedules grouped by date
- **Auth Required**: No
- **Response**: Schedules organized by travel date

### POST `/api/buses/search`
- **Purpose**: Search buses by route and date
- **Auth Required**: Yes
- **Body**: `{ fromCity, toCity, travelDate, showAllDates }`
- **Response**: Array of available buses/schedules
- **Features**:
  - Filters by route and date
  - Checks `booking_allowed` (bus hasn't departed)
  - Returns 30-day view if `showAllDates: true`

### GET `/api/buses/seats/:scheduleId`
- **Purpose**: Get seat layout and availability for a schedule
- **Auth Required**: Optional (shows different data if authenticated)
- **Response**: 
  ```json
  {
    "seats": [
      {
        "id": 1,
        "seat_number": "S1",
        "seat_type": "Window",
        "status": "available|booked|held|held-by-you",
        "expiresAt": "2026-02-18T12:30:00Z" // if held
      }
    ],
    "schedule": { ... }
  }
  ```
- **Features**:
  - Cleans expired holds automatically
  - Shows "held-by-you" for current user's holds
  - Shows "held" for other users' holds
  - Shows "booked" for confirmed bookings
  - Returns booking_allowed flag

---

## 💺 Seat Hold/Lock Routes (`/api/buses`)

### POST `/api/buses/hold-seat`
- **Purpose**: **FREEZE a seat for 5 minutes when user selects it**
- **Auth Required**: Yes
- **Body**: `{ scheduleId, seatNumber }`
- **Response**: `{ message, expiresAt }`
- **Behavior**:
  - ✅ Creates a hold for 5 minutes
  - ✅ Visible to ALL users (including same account on different browsers)
  - ✅ Prevents other users from selecting the seat
  - ✅ Auto-refreshes if same user selects again
  - ❌ Returns 409 if held by another user

### POST `/api/buses/release-seat`
- **Purpose**: **UNFREEZE a seat when user deselects it**
- **Auth Required**: Yes
- **Body**: `{ scheduleId, seatNumber }`
- **Response**: `{ message }`
- **Behavior**:
  - ✅ Immediately releases the seat
  - ✅ Makes seat available within seconds
  - ✅ Only the user who held it can release it

### POST `/api/buses/release-all-seats`
- **Purpose**: Release all held seats for a user (cleanup on page leave)
- **Auth Required**: Yes
- **Body**: `{ scheduleId }`
- **Response**: `{ message, count }`

### POST `/api/buses/lock-seats`
- **Purpose**: Lock seats during payment process (after hold, before booking)
- **Auth Required**: Yes
- **Body**: `{ scheduleId, seatNumbers }`
- **Response**: `{ message, lockedSeats }`

---

## 🎫 Booking Routes (`/api/buses`)

### POST `/api/buses/book`
- **Purpose**: Create a confirmed booking (after payment)
- **Auth Required**: Yes
- **Body**: 
  ```json
  {
    "scheduleId": 1,
    "seatNumbers": ["S1", "S2"],
    "passengerName": "John Doe",
    "passengerAge": 30,
    "passengerGender": "Male",
    "totalPrice": 2000
  }
  ```
- **Response**: Booking details with PNR
- **Behavior**:
  - ✅ Marks seats as "booked" permanently
  - ✅ Sends confirmation email
  - ✅ Releases seat locks
  - ✅ Updates available_seats count

### GET `/api/buses/my-bookings`
- **Purpose**: Get all bookings for current user
- **Auth Required**: Yes
- **Response**: Array of bookings with details

### POST `/api/buses/cancel`
- **Purpose**: Cancel a booking
- **Auth Required**: Yes
- **Body**: `{ pnr }`
- **Response**: Cancellation confirmation with refund details

---

## 🤖 AI Agent Routes (`/api/agents`)

### POST `/api/agents/chat`
- **Purpose**: Chat with AI agent for booking, search, or cancellation
- **Auth Required**: Yes
- **Body**: `{ message }`
- **Response**: 
  ```json
  {
    "response": "AI response text",
    "structuredData": { ... },
    "agentsInvolved": ["SearchAgent", "ConversationalAgent"],
    "reactSteps": 5,
    "duration": 1234
  }
  ```
- **Features**:
  - **Seat Freezing**: When agent books, it HOLDS seats for 5 minutes
  - Uses multi-agent orchestration
  - Supports natural language queries
  - Returns structured data for UI rendering

### POST `/api/agents/task`
- **Purpose**: Create async agent task
- **Auth Required**: Yes
- **Body**: `{ taskType, inputData }`
- **Response**: Task ID and status

### POST `/api/agents/task/sync`
- **Purpose**: Create and wait for agent task completion
- **Auth Required**: Yes
- **Body**: `{ taskType, inputData }`
- **Response**: Complete task result

### GET `/api/agents/task/:id`
- **Purpose**: Get task status and result
- **Auth Required**: Yes
- **Response**: Task details with agent decisions

---

## 👑 Owner Routes (`/api/owner`)

### POST `/api/owner/login`
- **Purpose**: Owner login
- **Auth Required**: No
- **Body**: `{ email, password }`
- **Response**: Owner details + JWT token

### GET `/api/owner/dashboard`
- **Purpose**: Get dashboard statistics
- **Auth Required**: Yes (Owner)
- **Response**: User count, route count, bus count, bookings, revenue

### GET `/api/owner/users`
- **Purpose**: Get all users
- **Auth Required**: Yes (Owner)
- **Response**: Array of users with booking counts

### GET `/api/owner/routes`
- **Purpose**: Get all routes
- **Auth Required**: Yes (Owner)
- **Response**: Array of routes

### GET `/api/owner/buses`
- **Purpose**: Get all buses
- **Auth Required**: Yes (Owner)
- **Response**: Array of buses with details

### GET `/api/owner/bookings`
- **Purpose**: Get all bookings with filters
- **Auth Required**: Yes (Owner)
- **Query Params**: `status`, `date`, `userId`, `scheduleId`
- **Response**: Array of bookings

---

## 🔧 Admin Routes (`/api/admin`)

### POST `/api/admin/login`
- **Purpose**: Admin login
- **Auth Required**: No
- **Body**: `{ email, password }`
- **Response**: Admin details + JWT token

### POST `/api/admin/verify-otp`
- **Purpose**: Verify admin OTP
- **Auth Required**: Partial (admin ID in token)
- **Body**: `{ otp }`
- **Response**: Full admin access token

### GET `/api/admin/dashboard`
- **Purpose**: Get admin dashboard data
- **Auth Required**: Yes (Admin)
- **Response**: System statistics

---

## 🔄 Seat Freezing Flow

### Regular Booking Flow:
1. **User selects seat** → `POST /api/buses/hold-seat`
   - Seat status: `available` → `held` (5 min freeze)
   - ✅ Visible to ALL users in real-time (2-second polling)
   
2. **User deselects seat** → `POST /api/buses/release-seat`
   - Seat status: `held` → `available` (immediate)
   - ✅ Available within seconds
   
3. **User proceeds to payment** → `POST /api/buses/lock-seats`
   - Seat remains frozen during payment
   
4. **User confirms booking** → `POST /api/buses/book`
   - Seat status: `held` → `booked` (permanent)
   - ✅ Email confirmation sent

### Agent Booking Flow:
1. **User asks agent to book** → `POST /api/agents/chat`
   - Agent validates request
   
2. **Agent locks seats** → Internal `lockSeats()` function
   - Seat status: `available` → `held` (5 min freeze)
   - ✅ Same behavior as regular booking
   
3. **User confirms payment** → Agent calls booking logic
   - Seat status: `held` → `booked` (permanent)
   
4. **User cancels/times out** → Seat lock expires automatically
   - After 5 minutes: `held` → `available`

---

## ⏱️ Real-Time Updates

### Frontend Polling:
- **SeatSelectionPage**: Polls every **2 seconds** for seat status
- **ResultsPage**: Shows real-time availability
- **AIAgentPage**: Agent bookings use same hold mechanism

### Database Cleanup:
- Expired holds (>5 min) are automatically removed on:
  - Any seat status query
  - Hold/release operations
  - Booking operations

---

## 🎯 Key Features

### Same Account, Different Browser:
✅ **Works!** When User A selects seat on Browser 1, User A on Browser 2 sees it as "held" within 2 seconds.

### Different Account:
✅ **Works!** When User A holds a seat, User B sees it as "held" and cannot select it.

### Agent Bookings:
✅ **Works!** Agent uses the same hold mechanism, so seats are frozen for 5 minutes during agent-assisted booking.

### Auto-Expiry:
✅ **Works!** If user doesn't complete booking within 5 minutes, seat is automatically released.

---

## 📊 Database Tables

### `seat_locks`
```sql
CREATE TABLE seat_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  seat_number TEXT NOT NULL,
  locked_by_user INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  UNIQUE(schedule_id, seat_number)
);
```

### `bookings`
```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  schedule_id INTEGER NOT NULL,
  seat_numbers TEXT NOT NULL,
  passenger_name TEXT,
  passenger_age INTEGER,
  passenger_gender TEXT,
  total_price REAL NOT NULL,
  booking_status TEXT DEFAULT 'confirmed',
  pnr TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🚀 Testing Scenarios

### Scenario 1: Same User, Multiple Browsers
1. Open App in Chrome
2. Login with User A
3. Open App in Edge
4. Login with User A
5. In Chrome: Select seat S1
6. In Edge: Refresh seat page (or wait 2s)
7. **Expected**: Seat S1 shows as "held-by-you" in both browsers

### Scenario 2: Different Users
1. Browser 1: User A selects seat S1
2. Browser 2: User B tries to select S1
3. **Expected**: User B sees error "Seat already held by another user"

### Scenario 3: Agent Booking
1. Open AI Agent page
2. Say "Book seat S1 on schedule 1234"
3. Agent locks the seat
4. Open regular booking page
5. **Expected**: Seat S1 shows as "held" (unavailable)

### Scenario 4: Timeout
1. Select seat S1
2. Wait 5 minutes without booking
3. Refresh page
4. **Expected**: Seat S1 is available again

---

## 📝 Summary

All routes work together to provide:
- ✅ Real-time seat freezing across all sessions
- ✅ 5-minute hold duration
- ✅ Immediate release on deselection
- ✅ Consistent behavior for regular and agent bookings
- ✅ Auto-cleanup of expired holds
- ✅ Clear visual feedback for users

**Polling Interval**: 2 seconds (fast enough for real-time feel)
**Hold Duration**: 5 minutes (enough time to complete booking)
**Status Updates**: Instant on user action, 2-second max delay for others
