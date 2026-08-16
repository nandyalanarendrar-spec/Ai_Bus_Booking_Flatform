# BusGo AI - Complete Architecture Guide

## 🎯 Project Overview

**BusGo** is a full-stack AI-powered bus reservation system that uses **LangGraph** (a state machine framework from LangChain) to coordinate **5 specialized AI agents**. The system processes natural language requests and handles bus searches, ticket bookings, cancellations, and general queries.

---

## 📁 Project Structure (After Cleanup)

```
narendra2/
├── package.json              # Root: runs both frontend & backend
├── client/                   # React Frontend (User App)
├── owner/                    # React Frontend (Owner Dashboard)
└── server/                   # Express.js Backend
    ├── index.js              # Main entry point
    ├── agents/               # AI Agent System
    │   ├── orchestrator.js   # Central controller
    │   ├── dbUtils.js        # Database helpers
    │   └── langgraph/        # LangGraph Implementation
    │       ├── graphBuilder.js
    │       ├── stateDefinition.js
    │       ├── llmService.js
    │       ├── index.js
    │       └── nodes/        # 5 Core AI Agents
    ├── routes/               # API Routes
    ├── database/             # SQLite Setup
    ├── middleware/           # JWT Auth
    └── services/             # Email Service
```

---

## 🖥️ FRONTEND ARCHITECTURE

### Technology: React + TypeScript + Vite

| Package | Version | Purpose |
|---------|---------|---------|
| **React** | 18.2.0 | UI library - component-based architecture |
| **TypeScript** | 5.2.2 | Type safety for JavaScript |
| **Vite** | 5.0.8 | Fast build tool & dev server |
| **react-router-dom** | 6.20.0 | Client-side routing (HashRouter) |
| **Axios** | 1.6.2 | HTTP client for API calls |
| **Tailwind CSS** | 3.3.6 | Utility-first CSS framework |

### How Frontend Works:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND FLOW                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. User opens app → main.tsx renders App.tsx                      │
│                                                                     │
│  2. App.tsx wraps everything in:                                   │
│     ├── AuthProvider (context for user/token state)                │
│     └── HashRouter (enables SPA navigation)                        │
│                                                                     │
│  3. Routes map URLs to Pages:                                      │
│     ├── /            → HomePage (search form)                      │
│     ├── /search      → ResultsPage (bus list)                      │
│     ├── /ai-agent    → AIAgentPage (chat interface)                │
│     ├── /login       → LoginPage (authentication)                  │
│     └── /my-bookings → MyBookingsPage (user's tickets)             │
│                                                                     │
│  4. API calls go through axios.ts:                                 │
│     - Base URL: http://localhost:5000/api                          │
│     - Adds Authorization header from localStorage                  │
│     - Logs all requests/responses                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Frontend Files:

| File | Purpose |
|------|---------|
| `client/src/main.tsx` | Entry point - renders App into #root |
| `client/src/App.tsx` | Router setup with all page routes |
| `client/src/api/axios.ts` | Axios instance with interceptors |
| `client/src/context/AuthContext.tsx` | User auth state management |
| `client/src/pages/AIAgentPage.tsx` | Chat UI for AI agents |

### AuthContext Explained:

```typescript
// Provides global auth state to all components
const AuthContext = {
  user: { id, username, email } | null,
  token: string | null,
  isAuthenticated: boolean,
  login: (username, password) => Promise,
  register: (username, email, password) => Promise,
  logout: () => void
}
```

- **Login Flow**: 
  1. User enters credentials
  2. POST `/api/auth/login`
  3. Server returns JWT token + user data
  4. Store in localStorage + React state
  5. Axios interceptor adds token to all future requests

---

## ⚙️ BACKEND ARCHITECTURE

### Technology: Node.js + Express.js (JavaScript Only)

| Package | Version | Purpose |
|---------|---------|---------|
| **Express** | 4.18.2 | Web framework for REST APIs |
| **SQLite3** | 5.1.7 | Embedded database (no server needed) |
| **@langchain/langgraph** | 1.1.4 | State machine for AI agents |
| **@langchain/ollama** | 1.2.2 | LLM integration |
| **jsonwebtoken** | 9.0.2 | JWT authentication |
| **bcryptjs** | 2.4.3 | Password hashing |
| **nodemailer** | 8.0.0 | Email verification |
| **cors** | 2.8.5 | Cross-origin requests |
| **dotenv** | 17.2.4 | Environment variables |

### How Backend Works:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND FLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Server starts (index.js):                                      │
│     ├── Initialize SQLite database                                 │
│     ├── Create all tables automatically                            │
│     ├── Set up Express middleware                                  │
│     └── Register all routes                                        │
│                                                                     │
│  2. API Routes:                                                    │
│     ├── /api/auth    → auth.js (login, register, verify)           │
│     ├── /api/agents  → agents.js (AI chat endpoint)                │
│     ├── /api/buses   → buses.js (direct bus queries)               │
│     ├── /api/admin   → admin.js (admin dashboard)                  │
│     └── /api/owner   → owner.js (owner dashboard)                  │
│                                                                     │
│  3. When user sends message to /api/agents/chat:                   │
│     ├── Parse user intent (what do they want?)                     │
│     ├── Extract entities (cities, dates, seats)                    │
│     ├── Create task in database                                    │
│     └── Call orchestrateAgents() → LangGraph                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Main Server Entry (index.js):

```javascript
// What happens when server starts:

1. initializeDatabase()     // Creates app.db file
   └── createTables()       // Creates all 10+ tables

2. app.use(cors())          // Allow frontend requests
   app.use(express.json())  // Parse JSON bodies

3. app.use('/api/auth', authRoutes)
   app.use('/api/agents', agentRoutes)  // ← AI lives here
   app.use('/api/buses', busRoutes)
   ...

4. app.listen(5000)         // Start accepting requests
```

---

## 🧠 AI AGENT SYSTEM (LangGraph)

### What is LangGraph?

LangGraph is a **state machine framework** that allows you to define:
- **Nodes**: Functions that process state
- **Edges**: Connections between nodes
- **State**: Shared data that flows through all nodes

### How It Works in BusGo:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LANGGRAPH EXECUTION                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  User: "Find buses from Mumbai to Pune tomorrow"                   │
│                         │                                          │
│                         ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ORCHESTRATOR (orchestrator.js)                               │   │
│  │   1. Parse intent → "search_buses"                          │   │
│  │   2. Extract entities → {from: "Mumbai", to: "Pune", ...}   │   │
│  │   3. Select graph → buildSearchGraph()                       │   │
│  │   4. Build initial state                                     │   │
│  │   5. Invoke graph                                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                         │                                          │
│                         ▼                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ LANGGRAPH STATE MACHINE                                      │   │
│  │                                                               │   │
│  │   START                                                       │   │
│  │     │                                                         │   │
│  │     ▼                                                         │   │
│  │   [busSearchNode]  ← Searches DB, analyzes prices via LLM    │   │
│  │     │                                                         │   │
│  │     ▼                                                         │   │
│  │   [conversationalNode]  ← Formats response naturally         │   │
│  │     │                                                         │   │
│  │     ▼                                                         │   │
│  │   END → Response sent to user                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### The 5 Core AI Agents:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                           5 CORE AI AGENTS                                     │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. BUS SEARCH AGENT (busSearchNode.js)                                  │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │ Purpose: Find available buses between cities                            │  │
│  │ Uses LLM: YES - for price analysis and recommendations                  │  │
│  │                                                                          │  │
│  │ What it does:                                                            │  │
│  │   ├── Validates route exists (Mumbai → Pune: valid?)                    │  │
│  │   ├── Queries schedules table for matching buses                        │  │
│  │   ├── Calculates real-time seat availability                            │  │
│  │   ├── Applies filters (AC/Non-AC, price range, time)                    │  │
│  │   ├── Uses LLM to analyze prices and generate insights                  │  │
│  │   └── Creates recommendations (Best Value, Fastest, Most Popular)       │  │
│  │                                                                          │  │
│  │ Database Tables: routes, buses, schedules, bookings                     │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. BOOKING AGENT (bookingValidationNode.js)                             │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │ Purpose: Process ticket bookings with validation                        │  │
│  │ Uses LLM: NO - pure database operations                                 │  │
│  │                                                                          │  │
│  │ What it does:                                                            │  │
│  │   ├── Validates schedule exists and is in future                        │  │
│  │   ├── Anomaly detection (max 6 seats, rate limiting)                    │  │
│  │   ├── Checks seats aren't already booked                                │  │
│  │   ├── Creates temporary seat locks (5-minute TTL)                       │  │
│  │   ├── Generates unique PNR (e.g., BG7X9K2M)                             │  │
│  │   ├── Inserts booking record                                            │  │
│  │   └── Calculates total with taxes                                       │  │
│  │                                                                          │  │
│  │ Database Tables: schedules, bookings, seat_locks, users                 │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. CANCELLATION AGENT (policyCancellationNode.js)                       │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │ Purpose: Handle cancellations with tiered refund policies               │  │
│  │ Uses LLM: NO - policy rules are deterministic                           │  │
│  │                                                                          │  │
│  │ Refund Policy:                                                           │  │
│  │   ├── >24 hours before departure: 90% refund                            │  │
│  │   ├── 12-24 hours: 75% refund                                           │  │
│  │   ├── 6-12 hours: 50% refund                                            │  │
│  │   ├── 2-6 hours: 25% refund                                             │  │
│  │   └── <2 hours: No refund (cancellation blocked)                        │  │
│  │                                                                          │  │
│  │ What it does:                                                            │  │
│  │   ├── Finds booking by PNR                                              │  │
│  │   ├── Verifies user owns the booking                                    │  │
│  │   ├── Calculates time until departure                                   │  │
│  │   ├── Applies appropriate refund tier                                   │  │
│  │   ├── Updates booking status to 'cancelled'                             │  │
│  │   └── Returns refund breakdown                                          │  │
│  │                                                                          │  │
│  │ Database Tables: bookings, schedules                                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. KNOWLEDGE AGENT (knowledgeNode.js)                                   │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │ Purpose: Answer FAQs and general questions                              │  │
│  │ Uses LLM: YES - for questions not in knowledge base                     │  │
│  │                                                                          │  │
│  │ Knowledge Categories:                                                    │  │
│  │   ├── booking_help: How to book, payment methods                        │  │
│  │   ├── cancellation_policy: Refund rules                                 │  │
│  │   ├── refund_process: How refunds are processed                         │  │
│  │   ├── bus_types: AC, Non-AC, Sleeper, Seater                           │  │
│  │   ├── seat_layout: Upper/lower deck, window/aisle                       │  │
│  │   ├── baggage_policy: Luggage limits                                    │  │
│  │   ├── contact_support: How to reach support                             │  │
│  │   ├── tracking: How to track your bus                                   │  │
│  │   ├── pnr_info: What is PNR                                             │  │
│  │   └── boarding: Pickup points, times                                    │  │
│  │                                                                          │  │
│  │ Flow:                                                                    │  │
│  │   1. Pattern match query to knowledge base                              │  │
│  │   2. If found → return pre-written answer                               │  │
│  │   3. If not found → use LLM to generate answer                          │  │
│  │                                                                          │  │
│  │ Database Tables: routes (for available routes query)                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 5. CONVERSATIONAL AGENT (conversationalNode.js)                         │  │
│  ├─────────────────────────────────────────────────────────────────────────┤  │
│  │ Purpose: Format all responses for user presentation                     │  │
│  │ Uses LLM: YES - for natural language enhancement                        │  │
│  │ Runs: ALWAYS (last step in every graph)                                 │  │
│  │                                                                          │  │
│  │ What it does:                                                            │  │
│  │   ├── Takes raw data from previous agent                                │  │
│  │   ├── Selects appropriate response template                             │  │
│  │   ├── Adds helpful suggestions for next actions                         │  │
│  │   ├── Uses LLM to make response sound natural                           │  │
│  │   └── Handles error messages gracefully                                 │  │
│  │                                                                          │  │
│  │ Response Templates:                                                      │  │
│  │   ├── searchSuccess: "Found X buses from A to B..."                     │  │
│  │   ├── bookingSuccess: "Booking confirmed! PNR: XXX..."                  │  │
│  │   ├── cancellationSuccess: "Cancelled. Refund: ₹XXX..."                 │  │
│  │   ├── noResults: "No buses found matching your criteria..."             │  │
│  │   └── error: "Sorry, something went wrong..."                           │  │
│  │                                                                          │  │
│  │ Database Tables: None (pure formatting)                                 │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Graph Flows by Task Type:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GRAPH FLOWS                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  search_buses:                                                              │
│    START → busSearchNode → conversationalNode → END                        │
│            (search DB)     (format results)                                 │
│                                                                             │
│  book_ticket:                                                               │
│    START → bookingValidationNode → conversationalNode → END                │
│            (validate & book)        (confirm booking)                       │
│                                                                             │
│  cancel_booking:                                                            │
│    START → policyCancellationNode → conversationalNode → END               │
│            (process refund)          (show refund details)                  │
│                                                                             │
│  general_query:                                                             │
│    START → knowledgeNode → conversationalNode → END                        │
│            (find answer)    (format response)                               │
│                                                                             │
│  get_seat_layout:                                                           │
│    START → knowledgeNode → conversationalNode → END                        │
│            (seat info)      (format layout)                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ DATABASE ARCHITECTURE

### Technology: SQLite (via sqlite3 npm package)

SQLite is an **embedded database** - no separate server needed. The database file (`app.db`) is created automatically on first run.

### Database Tables:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATABASE TABLES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USERS                                                                      │
│  ├── id (PRIMARY KEY)                                                       │
│  ├── username (UNIQUE)                                                      │
│  ├── email (UNIQUE)                                                         │
│  ├── password (bcrypt hashed)                                               │
│  ├── phone                                                                  │
│  ├── verified (0/1)                                                         │
│  └── created_at                                                             │
│                                                                             │
│  ROUTES                                                                     │
│  ├── id (PRIMARY KEY)                                                       │
│  ├── from_city (e.g., "Mumbai")                                             │
│  ├── to_city (e.g., "Pune")                                                 │
│  ├── distance_km (e.g., 150)                                                │
│  └── duration_hours (e.g., 3.5)                                             │
│                                                                             │
│  BUSES                                                                      │
│  ├── id (PRIMARY KEY)                                                       │
│  ├── bus_number (e.g., "MH-04-AB-1234")                                     │
│  ├── bus_name (e.g., "Express Deluxe")                                      │
│  ├── bus_type (e.g., "AC Sleeper")                                          │
│  ├── has_ac (0/1)                                                           │
│  ├── is_sleeper (0/1)                                                       │
│  ├── total_seats (e.g., 40)                                                 │
│  ├── operator (e.g., "BusGo Travels")                                       │
│  └── rating (e.g., 4.5)                                                     │
│                                                                             │
│  SCHEDULES (One row per bus per date)                                       │
│  ├── id (PRIMARY KEY)                                                       │
│  ├── route_id (→ routes.id)                                                 │
│  ├── bus_id (→ buses.id)                                                    │
│  ├── departure_time (e.g., "08:00")                                         │
│  ├── arrival_time (e.g., "11:30")                                           │
│  ├── base_price (e.g., 650.00)                                              │
│  ├── available_seats (updated on booking)                                   │
│  └── travel_date (e.g., "2026-02-15")                                       │
│                                                                             │
│  BOOKINGS                                                                   │
│  ├── id (PRIMARY KEY)                                                       │
│  ├── user_id (→ users.id)                                                   │
│  ├── schedule_id (→ schedules.id)                                           │
│  ├── seat_numbers (JSON: ["A1", "A2"])                                      │
│  ├── passenger_name                                                         │
│  ├── passenger_age                                                          │
│  ├── passenger_gender                                                       │
│  ├── total_price                                                            │
│  ├── booking_status ("confirmed"/"cancelled")                               │
│  └── pnr (UNIQUE, e.g., "BG7X9K2M")                                         │
│                                                                             │
│  SEAT_LOCKS (Temporary locks during booking)                                │
│  ├── id (PRIMARY KEY)                                                       │
│  ├── schedule_id                                                            │
│  ├── seat_number                                                            │
│  ├── locked_by_user                                                         │
│  └── expires_at (5 minutes TTL)                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🤖 LLM INTEGRATION (Ollama)

### Technology: Local Ollama with llama3.2 model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OLLAMA LLM SERVICE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  File: server/agents/langgraph/llmService.js                               │
│                                                                             │
│  Configuration:                                                             │
│    Host: localhost                                                          │
│    Port: 11434                                                              │
│    Model: llama3.2                                                          │
│    Timeout: 60 seconds                                                      │
│                                                                             │
│  Functions:                                                                 │
│    generate(prompt, options) → string                                       │
│    chat(messages, options) → string                                         │
│                                                                             │
│  Used By:                                                                   │
│    ├── busSearchNode: Price analysis, recommendations                       │
│    ├── knowledgeNode: Complex question answering                            │
│    └── conversationalNode: Natural language formatting                      │
│                                                                             │
│  Example:                                                                   │
│    const response = await llmService.generate(                              │
│      "Analyze these bus prices and suggest value: [prices]",               │
│      { temperature: 0.7 }                                                   │
│    );                                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### To Start Ollama:
```bash
# Install Ollama (if not installed)
# Download from: https://ollama.ai

# Pull the model
ollama pull llama3.2

# Ollama runs automatically on localhost:11434
```

---

## 🔐 AUTHENTICATION SYSTEM

### Technology: JWT (JSON Web Tokens) + bcrypt

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AUTH FLOW                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Registration:                                                              │
│    1. User submits: username, email, password                              │
│    2. Server hashes password with bcrypt (10 rounds)                       │
│    3. Insert into users table (unverified)                                 │
│    4. Send OTP to email (nodemailer)                                       │
│    5. User verifies with OTP                                               │
│    6. Return JWT token + user data                                         │
│                                                                             │
│  Login:                                                                     │
│    1. User submits: username, password                                     │
│    2. Find user in database                                                │
│    3. Compare password with bcrypt                                         │
│    4. If match → generate JWT (expires in 24h)                             │
│    5. Return token + user data                                             │
│                                                                             │
│  Protected Routes:                                                          │
│    1. Frontend includes: Authorization: Bearer <token>                     │
│    2. Middleware decodes JWT                                               │
│    3. Attaches user to request                                             │
│    4. Route handler can access req.user                                    │
│                                                                             │
│  JWT Payload:                                                               │
│    {                                                                        │
│      id: 5,                                                                 │
│      username: "john",                                                      │
│      email: "john@example.com",                                             │
│      iat: 1707936000,                                                       │
│      exp: 1708022400                                                        │
│    }                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 HOW TO RUN

```bash
# From project root (narendra2/)
npm start

# This runs:
# 1. Backend on http://localhost:5000
# 2. Frontend on http://localhost:5173

# For owner dashboard too:
npm run start:all
# Also runs owner on http://localhost:5174
```

---

## 📡 API ENDPOINTS

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/auth/register` | POST | Create account | No |
| `/api/auth/login` | POST | Get JWT token | No |
| `/api/auth/verify-otp` | POST | Verify email | No |
| `/api/agents/chat` | POST | AI chat endpoint | Yes |
| `/api/buses/search` | GET | Direct bus search | No |
| `/api/buses/schedule/:id` | GET | Schedule details | No |
| `/api/admin/login` | POST | Admin login | No |
| `/api/admin/stats` | GET | Dashboard stats | Admin |
| `/api/owner/login` | POST | Owner login | No |
| `/api/owner/dashboard` | GET | Owner stats | Owner |

---

## 📊 COMPLETE DATA FLOW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE REQUEST FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER ACTION                                                             │
│     "Find buses from Mumbai to Pune tomorrow"                               │
│                         │                                                   │
│                         ▼                                                   │
│  2. FRONTEND (AIAgentPage.tsx)                                             │
│     api.post('/agents/chat', { message: "..." })                           │
│                         │                                                   │
│                         ▼                                                   │
│  3. BACKEND ROUTE (routes/agents.js)                                        │
│     ├── Parse intent: "search_buses"                                        │
│     ├── Extract entities: {from: "Mumbai", to: "Pune", ...}                │
│     └── Call orchestrateAgents()                                           │
│                         │                                                   │
│                         ▼                                                   │
│  4. ORCHESTRATOR (agents/orchestrator.js)                                   │
│     ├── Normalize input data                                               │
│     ├── Get graph: getGraphForTask("search_buses")                         │
│     └── graph.invoke(initialState)                                         │
│                         │                                                   │
│                         ▼                                                   │
│  5. LANGGRAPH STATE MACHINE                                                 │
│     ├── busSearchNode: Query DB, analyze with LLM                          │
│     │   ├── SELECT * FROM schedules JOIN routes JOIN buses...              │
│     │   ├── Calculate availability                                         │
│     │   └── LLM: Generate price insights                                   │
│     └── conversationalNode: Format response                                │
│         └── "Found 5 buses from Mumbai to Pune..."                         │
│                         │                                                   │
│                         ▼                                                   │
│  6. RESPONSE TO FRONTEND                                                    │
│     {                                                                       │
│       success: true,                                                        │
│       response: "Found 5 buses...",                                        │
│       structuredData: { buses: [...] },                                    │
│       agentsInvolved: ["BusSearchAgent", "ConversationalAgent"]            │
│     }                                                                       │
│                         │                                                   │
│                         ▼                                                   │
│  7. FRONTEND DISPLAY                                                        │
│     Show response in chat + bus cards                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 FILES REMOVED (Duplication Cleanup)

Deleted to remove code duplication:
- `server/langgraph-core/` (entire folder) - Duplicate LangGraph implementation
- `server/routes/aiRouter.js` - Unused route for `/api/ai`
- `server/index-langgraph.js` - Alternate server entry (unused)

**Current active implementation: `server/agents/langgraph/`** with 5 core agents.

---

## ✅ Summary

| Layer | Technology | What It Does |
|-------|------------|--------------|
| **Frontend** | React + TypeScript + Vite | User interface with chat |
| **Routing** | react-router-dom (HashRouter) | SPA navigation |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **API Client** | Axios | HTTP requests with JWT |
| **Backend** | Express.js | REST API server |
| **Database** | SQLite | Embedded SQL database |
| **AI Framework** | LangGraph | Agent orchestration |
| **LLM** | Ollama (llama3.2) | Natural language AI |
| **Auth** | JWT + bcrypt | Secure authentication |
| **Email** | Nodemailer | OTP verification |
