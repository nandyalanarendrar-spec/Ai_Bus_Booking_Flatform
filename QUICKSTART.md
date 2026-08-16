# 🚀 Quick Start Guide

## Installation & Running

Simply run from the project root:

```bash
npm start
```

This single command will:
- Install all dependencies (backend & frontend)
- Start the Express backend on port 5000
- Auto-create SQLite database
- Create all 9 tables
- Seed realistic bus data
- Start React frontend on port 5173
- Auto-open browser

## What's Created Automatically

✅ **Database** (`server/database/app.db`)
- 6 Indian routes (Hyderabad-Vijayawada, Bangalore-Chennai, etc.)
- 6 buses with different types (Volvo, Sleeper, Non-AC)
- 240 seats (40 per bus in 2+2 layout)
- 42 schedules (7 days of availability)
- 5 cancellation rules

✅ **Backend** (http://localhost:5000)
- Express server with CORS enabled
- JWT authentication
- 11 AI agents working together
- All routes auto-registered

✅ **Frontend** (http://localhost:5173)
- React app with Tailwind CSS
- Modern glassmorphism design
- Interactive bus chassis seat selector
- Responsive mobile-first UI

## First Time Use

1. **Register an account** (auto-verified, no OTP needed)
2. **Search buses** from home page
3. **View results** with AI recommendations
4. **Select seats** on interactive bus layout
5. **Book ticket** with passenger details
6. **View booking** with PNR confirmation

## Key Features to Try

### 🤖 AI-Powered Search
Search "Hyderabad to Bangalore" and see:
- **BusSearchAgent** finds available buses
- **PriceIntelligenceAgent** analyzes value
- **JourneyOptimizationAgent** scores comfort
- **RecommendationAgent** ranks options

### 💺 Smart Seat Selection
- Visual 2+2 bus chassis layout
- Real-time availability
- Color-coded status (available/booked/female)
- Recommended seats based on preferences

### 📋 Booking Management
- View all your bookings
- Cancel with auto-refund calculation
- PNR-based booking details
- Real-time seat locks (5 minutes)

## API Endpoints

### Auth
- POST `/api/auth/register` - Create account
- POST `/api/auth/login` - Login

### Buses
- POST `/api/buses/search` - Search buses
- GET `/api/buses/seats/:scheduleId` - Get seat layout
- POST `/api/buses/book` - Book ticket
- GET `/api/buses/my-bookings` - View bookings
- POST `/api/buses/cancel/:pnr` - Cancel booking

### AI Agents
- POST `/api/agents/task` - Create AI task
- GET `/api/agents/task/:id` - Get task result

## Troubleshooting

**Port 5000 or 5173 already in use?**
```bash
# Change ports in:
# server/index.js - PORT variable
# client/vite.config.ts - server.port
```

**Database locked?**
- Close any SQLite browser tools
- Delete `server/database/app.db` and restart

**Module not found errors?**
```bash
# Reinstall dependencies
cd server && npm install
cd ../client && npm install
```

## Project Structure

```
├── server/              # Backend (Express + SQLite)
│   ├── agents/          # 11 AI agents
│   ├── database/        # SQLite DB (auto-created)
│   ├── routes/          # API endpoints
│   └── index.js         # Server entry
├── client/              # Frontend (React + TypeScript)
│   ├── src/pages/       # App pages
│   └── src/context/     # Auth context
└── package.json         # Root with "npm start"
```

## Tech Stack

**Frontend**: React, TypeScript, Vite, Tailwind CSS, React Router (HashRouter), Axios  
**Backend**: Node.js, Express, SQLite (sqlite3), JWT, bcryptjs  
**Intelligence**: 11 specialized AI agents with orchestrator pattern

## Development Tips

- **Hot reload**: Frontend auto-reloads on changes
- **Backend restart**: Use nodemon for auto-restart
- **Database**: View with any SQLite browser at `server/database/app.db`
- **Logs**: Check terminal for agent decisions and reasoning

## Demo Users

No demo users needed! Registration is instant with auto-verification.

## Happy Booking! 🚌✨
