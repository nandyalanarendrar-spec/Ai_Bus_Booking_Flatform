# Project: Full-Stack Multi-Agent AI Application

## Tech Stack
- **Frontend**: React + TypeScript (Vite), Tailwind CSS, react-router-dom (HashRouter), Axios
- **Backend**: Node.js, Express.js (JavaScript), SQLite (better-sqlite3), JWT authentication
- **Intelligence**: Multi-agent AI architecture with rule-based heuristics, orchestrator pattern

## Development Rules
- Frontend must use HashRouter for routing
- Backend must be JavaScript only (no TypeScript)
- SQLite database auto-creates on startup
- All tables auto-create on startup
- Single command starts both frontend and backend
- App must be immediately usable

## Running the Application
```bash
npm start
```

This command:
1. Starts Express backend on port 5000
2. Auto-creates SQLite database
3. Auto-creates all tables
4. Starts React frontend on port 5173
5. Opens browser automatically
