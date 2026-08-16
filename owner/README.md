# Owner Application - Bus Reservation System

The **Owner Application** is a separate, secure dashboard for the system owner/admin to monitor and manage the entire bus reservation system.

## Features

### 🔐 Secure Owner Login
- Email + Password authentication
- Password stored securely with bcrypt hashing
- JWT-based session management
- Protected routes (users cannot access owner data)

### 📊 Dashboard Capabilities

#### 1. Overview (Statistics)
- Total Users
- Total Routes
- Total Buses
- Total Bookings
- Today's Bookings
- Total Revenue

#### 2. Users Management
View all registered users with:
- Username, Email, Phone
- Total bookings per user
- Total amount spent
- Registration date

#### 3. Routes Management
View all bus routes:
- From/To cities
- Distance (km)
- Duration (hours)
- Route ID

#### 4. Buses Management
View all buses:
- Bus number and name
- Bus type (Volvo, Sleeper, etc.)
- AC/Non-AC status
- Operator name
- Total seats
- Rating

#### 5. Bookings Management
View all bookings with filters:
- PNR, Passenger details
- User who booked
- Route and travel date
- Bus details
- Seat numbers
- Price and status

#### 6. Seat Status (CRITICAL FEATURE)
**The owner can:**
- Select ANY route
- Select ANY date (from 30-day rolling window)
- Select ANY bus on that route
- View seat map showing:
  - Seat number
  - Seat type (window/aisle/middle)
  - Status (Booked/Available)
  - Passenger name who booked
  - User email and PNR
  
This works for:
- Today's seats
- Any future date in the system

## Owner Credentials

**Email:** `nandyalanarendrar@gmail.com`  
**Password:** `n@rendra-16`

⚠️ **Security Note:** Password is hashed with bcrypt before storing in the database.

## Running the Owner App

### Option 1: Run Owner App Only
```bash
cd owner
npm install
npm run dev
```

The owner app will open at: **http://localhost:5174**

### Option 2: Run All Apps Together
From the root directory:
```bash
npm run start:all
```

This starts:
- **Server** on port 5000
- **Client** on port 5173
- **Owner** on port 5174

## Technology Stack

- **Frontend:** React + TypeScript, Tailwind CSS
- **Routing:** react-router-dom (HashRouter)
- **HTTP Client:** Axios
- **Build Tool:** Vite
- **Backend:** Express.js (shared with client app)
- **Database:** SQLite (shared)

## API Endpoints

All owner endpoints are protected and require JWT authentication with `role: OWNER`.

### Authentication
- `POST /api/owner/login` - Owner login

### Dashboard APIs
- `GET /api/owner/dashboard/stats` - System statistics
- `GET /api/owner/users` - All users
- `GET /api/owner/routes` - All routes
- `GET /api/owner/buses` - All buses
- `GET /api/owner/bookings` - All bookings (with filters)
- `GET /api/owner/schedules` - Schedules for route + date
- `GET /api/owner/seat-status` - Seat booking status
- `GET /api/owner/available-dates` - Available dates in system

## Security Features

✅ Password hashed with bcrypt  
✅ JWT token-based authentication  
✅ Role-based access control (OWNER role)  
✅ Protected routes (middleware validation)  
✅ Automatic token validation  
✅ Secure logout  
✅ Normal users cannot access owner APIs  

## Database Schema

The owner table structure:
```sql
CREATE TABLE owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Deployment Ready

This application is built for online deployment:
- Environment variables via `.env`
- Production-ready JWT authentication
- CORS enabled for cross-origin requests
- Secure password hashing
- Clean separation of concerns

Perfect for:
- **SIH (Smart India Hackathon)** projects
- **Final year college projects**
- **Production bus reservation systems**
- **Portfolio demonstrations**

## Development Notes

### Port Configuration
- Change port in `vite.config.ts` if needed (default: 5174)

### API Base URL
- Update in `src/api/axios.ts` for production deployment

### Styling
- Uses Tailwind CSS utility classes
- Responsive design for mobile/tablet/desktop
- Professional UI with color-coded statistics

## Support

For issues or questions, contact the system administrator.
