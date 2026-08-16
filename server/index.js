require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const busRoutes = require('./routes/buses');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owner');
const companyRoutes = require('./routes/company');
const { initializeDatabase, performDailyCleanup } = require('./database/init');
const { llmService } = require('./agents/langgraph');

// ─── Global safety net: prevent pg-pool timeouts or any unhandled promise
//     rejection from crashing the entire server process ─────────────────────
process.on('unhandledRejection', (reason, promise) => {
  const msg = reason && reason.message ? reason.message : String(reason);
  // Only log, never crash
  console.error('[UnhandledRejection] Caught and suppressed:', msg);
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException] Caught and suppressed:', err.message);
  // Do NOT call process.exit() — keep the server alive
});

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database and create tables
initializeDatabase();

// The cleanup service starts automatically during database initialization
// No need to manually trigger it here

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/company', companyRoutes);

// Public Places endpoint for dynamic city selection
app.get('/api/places', (req, res) => {
  try {
    const { getDatabase } = require('./database/init');
    const db = getDatabase();
    db.all(`
      SELECT id, name, state, code, image_url, landmarks, is_active FROM places WHERE is_active = 1
      UNION
      SELECT NULL as id, city as name, 'Andhra Pradesh' as state, UPPER(SUBSTRING(city FROM 1 FOR 3)) as code, NULL as image_url, NULL as landmarks, 1 as is_active
      FROM (
        SELECT DISTINCT from_city as city FROM routes WHERE from_city IS NOT NULL
        UNION
        SELECT DISTINCT to_city as city FROM routes WHERE to_city IS NOT NULL
      ) r
      ORDER BY name ASC
    `, (err, places) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch places' });

      // Deduplicate places by normalized city name, ensuring valid state
      const placeMap = new Map();
      (places || []).forEach((p) => {
        if (!p.name) return;
        const normKey = p.name.trim().toLowerCase();
        const existing = placeMap.get(normKey);

        const hasValidState = p.state && p.state.trim() !== '' && p.state !== 'Unknown State';
        const isTitleCased = p.name[0] === p.name[0].toUpperCase();

        if (!existing) {
          placeMap.set(normKey, p);
        } else {
          const existingValidState = existing.state && existing.state.trim() !== '' && existing.state !== 'Unknown State';
          if (!existingValidState && hasValidState) {
            placeMap.set(normKey, p);
          } else if (hasValidState && isTitleCased && existing.name[0] !== existing.name[0].toUpperCase()) {
            placeMap.set(normKey, p);
          }
        }
      });

      const cleanPlaces = Array.from(placeMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      res.json({ places: cleanPlaces });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch places' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Database status endpoint
app.get('/api/database/status', (req, res) => {
  const { getDatabase } = require('./database/init');
  const db = getDatabase();
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  db.get(`
    SELECT 
      MIN(travel_date) as first_date,
      MAX(travel_date) as last_date,
      COUNT(DISTINCT travel_date) as total_days,
      COUNT(*) as total_schedules
    FROM schedules
  `, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.all('SELECT DISTINCT travel_date FROM schedules ORDER BY travel_date LIMIT 10', (err, dates) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        today: todayStr,
        stats,
        first_10_dates: dates.map(d => d.travel_date),
        status: stats.total_days === 30 && stats.first_date === todayStr ? 'OK' : 'WARNING'
      });
    });
  });
});

// Manual cleanup trigger (for testing/admin)
app.post('/api/admin/cleanup', (req, res) => {
  try {
    // We'll need to get routes data - let's query from DB
    const { getDatabase } = require('./database/init');
    const db = getDatabase();
    
    db.all('SELECT from_city, to_city, distance_km, duration_hours FROM routes', (err, routes) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch routes' });
      }
      
      const routesData = routes.map(r => [r.from_city, r.to_city, r.distance_km, r.duration_hours]);
      performDailyCleanup(routesData);
      res.json({ message: 'Cleanup triggered successfully' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Cleanup failed: ' + error.message });
  }
});

async function bootstrap() {
  try {
    // Ensure Ollama + llama3.2 are ready before accepting chat traffic.
    await llmService.ensureReady();
  } catch (error) {
    console.error(`❌ LLM startup check failed: ${error.message}`);
    console.error('❌ Chat endpoint will return 503 until Ollama is fixed.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Database initialized`);
    console.log(`✅ All tables created`);
  });
}

bootstrap();
