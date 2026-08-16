# 🚌 AI-Powered Bus Reservation System

A full-stack bus booking application with multi-agent AI architecture for intelligent recommendations and booking assistance.

## 🎯 Features

- **Multi-Agent AI System**: 11 specialized AI agents working together
  - Bus Search & Matching Agent
  - Price Intelligence Agent
  - Seat Strategy Agent
  - Journey Optimization Agent
  - Recommendation & Ranking Agent
  - Booking Validation Agent
  - Policy & Cancellation Agent
  - Post-Booking Agent
  - User Context & Memory Agent
  - Anomaly & Safety Agent
  - Conversational Explanation Agent

- **Modern UI/UX**
  - Cinematic hero with animated background
  - Glassmorphism design
  - Interactive bus chassis seat selector (2+2 layout, 40 seats)
  - Smooth animations and transitions
  - Responsive mobile-first design

- **Smart Features**
  - AI-powered bus recommendations
  - Real-time seat availability
  - Intelligent pricing analysis
  - Journey optimization
  - Cancellation with refund calculation
  - User booking history

## 🛠️ Tech Stack

### Frontend
- **React** + TypeScript (Vite)
- **Tailwind CSS** - Utility-first styling
- **react-router-dom** - HashRouter for navigation
- **Axios** - HTTP client

### Backend
- **Node.js** + Express.js (JavaScript)
- **SQLite** with sqlite3
- **JWT** authentication
- **bcryptjs** for password hashing

### Intelligence Layer
- Multi-agent orchestrator pattern
- Rule-based + heuristic AI
- Explainable decisions
- No heavy ML dependencies

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm

### Installation & Running

**Single Command to Run Everything:**

```bash
npm start
```

This command will:
1. Install all backend dependencies
2. Install all frontend dependencies
3. Start Express server on port 5000
4. Auto-create SQLite database
5. Auto-create all tables
6. Seed realistic Indian bus data
7. Start React frontend on port 5173
8. Auto-open browser

The app will be ready to use immediately!

### Manual Installation (Optional)

If you prefer to install dependencies separately:

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install

# Run the app
cd ..
npm start
```

## 📁 Project Structure

```
├── .github/
│   └── copilot-instructions.md    # Project guidelines
├── server/                         # Backend
│   ├── agents/                     # 11 AI agents
│   │   ├── orchestrator.js         # Master orchestrator
│   │   ├── busSearchAgent.js
│   │   ├── priceIntelligenceAgent.js
│   │   ├── seatStrategyAgent.js
│   │   ├── journeyOptimizationAgent.js
│   │   ├── recommendationRankingAgent.js
│   │   ├── bookingValidationAgent.js
│   │   ├── policyCancellationAgent.js
│   │   ├── postBookingAgent.js
│   │   ├── userContextAgent.js
│   │   ├── anomalySafetyAgent.js
│   │   └── conversationalAgent.js
│   ├── database/
│   │   ├── init.js                 # DB initialization & seeding
│   │   └── app.db                  # SQLite database (auto-created)
│   ├── middleware/
│   │   └── auth.js                 # JWT middleware
│   ├── routes/
│   │   ├── auth.js                 # Auth endpoints
│   │   ├── buses.js                # Bus booking endpoints
│   │   └── agents.js               # AI agent endpoints
│   ├── index.js                    # Express server
│   └── package.json
├── client/                         # Frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── HomePage.tsx        # Landing page
│   │   │   ├── ResultsPage.tsx     # Search results
│   │   │   ├── SeatSelectionPage.tsx  # Bus chassis UI
│   │   │   ├── BookingPage.tsx     # Booking confirmation
│   │   │   ├── MyBookingsPage.tsx  # User bookings
│   │   │   └── LoginPage.tsx       # Authentication
│   │   ├── context/
│   │   │   └── AuthContext.tsx     # Auth state management
│   │   ├── api/
│   │   │   └── axios.ts            # API client
│   │   ├── App.tsx                 # Main app component
│   │   ├── main.tsx                # Entry point
│   │   └── index.css               # Global styles
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── package.json                    # Root package with start script
└── README.md
```

## 🗄️ Database Schema

**9 Auto-Created Tables:**

1. **users** - User accounts
2. **user_preferences** - User preferences
3. **routes** - Bus routes
4. **buses** - Bus information
5. **schedules** - Bus schedules
6. **seats** - Seat layout
7. **bookings** - Booking records
8. **seat_locks** - Temporary seat locks
9. **cancellation_rules** - Refund policies

All tables use `CREATE TABLE IF NOT EXISTS` and are auto-created on startup.

## 🎨 Design System

- **Primary Color**: Red #dc2626
- **Typography**: Inter font family
- **Border Radius**: rounded-3xl (2.5rem)
- **Spacing**: Tailwind's spacing scale
- **Animations**: Smooth transitions and hover effects

## 🔐 Authentication

- JWT-based authentication
- OTP verification (mocked for demo)
- Secure password hashing with bcryptjs
- Protected routes on frontend and backend

## 🧪 Seeded Data

The database is automatically seeded with:
- **6 Indian routes** (Hyderabad-Vijayawada, Bangalore-Chennai, etc.)
- **6 buses** (Volvo, Sleeper, Non-AC variants)
- **240 seats** (40 per bus in 2+2 layout)
- **42 schedules** (7 days of availability)
- **5 cancellation rules** (time-based refund percentages)

## 🤖 AI Agent Workflow

1. **User searches** → BusSearchAgent finds available buses
2. **PriceIntelligenceAgent** analyzes pricing
3. **JourneyOptimizationAgent** evaluates comfort & timing
4. **RecommendationAgent** ranks buses
5. **User selects seats** → SeatStrategyAgent recommends optimal seats
6. **BookingValidationAgent** validates the booking
7. **AnomalySafetyAgent** checks for suspicious patterns
8. **PostBookingAgent** generates confirmation details

All decisions are logged and explainable via **ConversationalAgent**.

## 📱 Pages

1. **Home** - Hero with search form
2. **Results** - Filtered & sorted bus list
3. **Seats** - Interactive bus chassis UI
4. **Booking** - Passenger details & confirmation
5. **My Bookings** - User booking history
6. **Login** - Authentication

## 🎯 API Endpoints

### Auth
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user

### Buses
- `GET /api/buses/routes` - Get all routes
- `POST /api/buses/search` - Search buses
- `GET /api/buses/seats/:scheduleId` - Get seat layout
- `POST /api/buses/lock-seats` - Lock seats temporarily
- `POST /api/buses/book` - Create booking
- `GET /api/buses/my-bookings` - Get user bookings
- `GET /api/buses/booking/:pnr` - Get booking details
- `POST /api/buses/cancel/:pnr` - Cancel booking

### Agents
- `POST /api/agents/task` - Create AI task
- `GET /api/agents/task/:id` - Get task status

## 🚦 Development

The app runs on:
- **Backend**: http://localhost:5000
- **Frontend**: http://localhost:5173

Frontend auto-opens in browser on `npm start`.

## 📝 Notes

- Database file `app.db` is created in `server/database/` on first run
- All dependencies install automatically with `npm start`
- No manual database setup required
- OTP verification is bypassed for demo (users auto-verified)

## 🎉 Ready to Use!

Just run `npm start` and start booking buses with AI-powered recommendations!

---

Built with ❤️ using React, Node.js, SQLite, and Multi-Agent AI
