# 🚌 Public Bus Reservation System

A comprehensive, production-ready **Public Bus Reservation System** with a clear three-layer architecture designed for online deployment, SIH projects, and final-year college projects.

## 🏗️ Architecture Overview

This system is built with **three clearly separated layers**:

### 1️⃣ Client Application (User App)
**Location:** `client/`  
**Port:** 5173  
**Purpose:** Public-facing application for users to search and book bus seats

**Features:**
- Search buses by route and date
- View available seats
- Book seats
- View booking history
- User authentication

### 2️⃣ Server (Shared Backend)
**Location:** `server/`  
**Port:** 5000  
**Purpose:** Central backend serving both client and owner applications

**Features:**
- Express.js REST API
- SQLite database with auto-creation
- JWT authentication
- Role-based access control
- Multi-agent AI system
- 30-day rolling seat inventory

### 3️⃣ Owner Application (Admin Dashboard)
**Location:** `owner/`  
**Port:** 5174  
**Purpose:** Secure dashboard for owner/admin to monitor ALL system data

**Features:**
- View all users
- View all routes
- View all buses
- View all bookings
- View seat status for ANY route, date, and bus
- Real-time statistics

---

## 🔐 Owner Login & Security

### Owner Credentials (Initial Seed)

**Email:** `nandyalanarendrar@gmail.com`  
**Password:** `n@rendra-16`

### Security Implementation

✅ **Password Hashing:** Passwords stored with bcrypt (never plain text)  
✅ **JWT Authentication:** Secure token-based sessions  
✅ **Role-Based Access:** Owner role (`OWNER`) enforced via middleware  
✅ **Protected Routes:** Normal users cannot access owner APIs  
✅ **Database Seeding:** Owner credentials auto-created on first run  
✅ **Environment Variables:** Sensitive data in `.env` file  

### Authentication Flow

1. Owner visits **http://localhost:5174** (Owner App)
2. Logs in with email + password
3. Backend validates credentials (bcrypt comparison)
4. JWT issued with `role: OWNER`
5. All subsequent requests authenticated via JWT
6. Owner can access ALL system data

---

## 📊 Owner Dashboard Capabilities

After login, the owner can:

### 1. View All Users
- Name, email, phone
- Total bookings per user
- Total spent
- Registration date

### 2. View All Routes
- Source and destination cities
- Distance (km)
- Duration (hours)

### 3. View All Buses
- Bus number and name
- Type (Volvo, Sleeper, AC, etc.)
- Operator
- Total seats
- Rating

### 4. View Seat Bookings (CRITICAL FEATURE)

The owner can:
- **Select ANY route** (e.g., Hyderabad → Bangalore)
- **Select ANY date** (from 30-day rolling window)
- **Select ANY bus** on that route
- **View seat map** showing:
  - Seat number
  - Status (Booked / Available)
  - Passenger name
  - User who booked
  - Email and PNR

**This works for:**
- ✅ Today's seats
- ✅ Any future date (within 30 days)
- ✅ All buses and routes

### 5. View All Bookings
Filter by:
- Route
- Date
- Bus
- Status

See:
- PNR, passenger details
- User information
- Price and booking status

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+)
- npm

### Option 1: Run Everything Together
```bash
npm install
npm run start:all
```

This starts:
- **Server:** http://localhost:5000
- **Client App:** http://localhost:5173 (opens automatically)
- **Owner App:** http://localhost:5174 (opens automatically)

### Option 2: Run Individually

**Server Only:**
```bash
cd server
npm install
npm start
```

**Client App Only:**
```bash
cd client
npm install
npm run dev
```

**Owner App Only:**
```bash
cd owner
npm install
npm run dev
```

---

## 🗄️ Database & Data Management

### Automatic Database Creation
- SQLite database (`server/database/app.db`) auto-creates on startup
- All tables auto-create
- Initial data automatically seeded

### 30-Day Rolling Window
The system maintains a **30-day rolling seat inventory**:
- Today + next 29 days (30 days total)
- Daily cleanup runs automatically
- Old data deleted
- New 31st day data generated

**Example:**
- Today: Feb 7, 2026
- Available dates: Feb 7 - Mar 8, 2026
- Tomorrow: Old Feb 7 data deleted, new Mar 9 data added

### Seeded Data
- **56 routes** (complete city network)
- **25 buses**
- **1000 seats** (40 per bus)
- **6720 schedules** (56 routes × 4 buses × 30 days)
- **1 owner account** (auto-seeded)

---

## 🛠️ Technology Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS
- react-router-dom (HashRouter)
- Axios

### Backend
- Node.js + Express.js
- SQLite (better-sqlite3)
- JWT authentication
- bcryptjs (password hashing)

### Intelligence
- Multi-agent AI architecture
- Rule-based heuristics
- Orchestrator pattern

---

## 📁 Project Structure

```
narendra2/
├── client/              # User-facing app
│   ├── src/
│   │   ├── pages/       # React pages
│   │   ├── components/  # Reusable components
│   │   ├── context/     # Auth context
│   │   └── api/         # Axios config
│   └── package.json
│
├── server/              # Shared backend
│   ├── routes/          # API routes
│   │   ├── auth.js      # User auth
│   │   ├── owner.js     # Owner APIs
│   │   ├── buses.js     # Bus routes
│   │   └── admin.js     # Admin routes
│   ├── database/        # DB initialization
│   ├── middleware/      # Auth middleware
│   └── agents/          # AI agents
│
├── owner/               # Owner dashboard app
│   ├── src/
│   │   ├── pages/       # Login & Dashboard
│   │   ├── context/     # Owner auth
│   │   └── api/         # Axios config
│   └── package.json
│
└── package.json         # Root scripts
```

---

## 🔗 API Endpoints

### Owner APIs (Protected with OWNER role)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/owner/login` | Owner login |
| GET | `/api/owner/dashboard/stats` | System statistics |
| GET | `/api/owner/users` | All users |
| GET | `/api/owner/routes` | All routes |
| GET | `/api/owner/buses` | All buses |
| GET | `/api/owner/bookings` | All bookings |
| GET | `/api/owner/schedules` | Schedules for route + date |
| GET | `/api/owner/seat-status` | Seat booking status |
| GET | `/api/owner/available-dates` | Available dates |

### User APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login |
| GET | `/api/buses/search` | Search buses |
| POST | `/api/buses/book` | Book seats |

---

## 🌐 Deployment Ready

This system is designed for **online hosting**:

✅ Environment-based configuration (`.env`)  
✅ CORS enabled for cross-origin requests  
✅ Production-ready security (JWT, bcrypt)  
✅ Auto-database initialization  
✅ No manual setup required  
✅ Scalable architecture  

**Perfect for:**
- Smart India Hackathon (SIH)
- Final year projects
- Production bus reservation systems
- Portfolio projects

---

## 🔒 Security Features

1. **Password Hashing:** bcrypt with 10 salt rounds
2. **JWT Tokens:** Secure session management
3. **Role-Based Access Control:** `OWNER` vs. `USER` roles
4. **Protected Routes:** Middleware validation
5. **SQL Injection Prevention:** Parameterized queries
6. **Environment Variables:** Sensitive data isolation

---

## 📝 Environment Variables

Create a `.env` file in the `server/` directory:

```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
PORT=5000
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

See `server/.env.example` for reference.

---

## 🧪 Testing Owner Login

1. Start the system: `npm run start:all`
2. Open **http://localhost:5174**
3. Login with:
   - Email: `nandyalanarendrar@gmail.com`
   - Password: `n@rendra-16`
4. Test features:
   - ✅ View statistics
   - ✅ View all users
   - ✅ Select route + date
   - ✅ View seat status
   - ✅ See who booked which seat

---

## 📚 Documentation

- **Owner App Details:** See `owner/README.md`
- **API Documentation:** Check route files in `server/routes/`
- **Database Schema:** See `server/database/init.js`

---

## 🤝 Support

For questions or issues:
1. Check the README files
2. Review code comments
3. Contact system administrator

---

## 📜 License

MIT License

---

## ✨ Key Highlights

🎯 **Three-layer architecture** (Client, Server, Owner)  
🔐 **Secure owner authentication** (bcrypt + JWT)  
📊 **Complete data visibility** for owners  
🚌 **30-day rolling inventory** management  
🌐 **Deployment-ready** for production  
🏆 **SIH & college project ready**  

---

**Built with ❤️ for scalable, secure, and professional bus reservation systems.**
