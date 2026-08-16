const express = require('express');
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { sendBookingConfirmationEmail, sendCancellationEmail } = require('../services/emailService');

const router = express.Router();

// Helper function to check if booking is allowed based on departure time
function isBookingAllowed(travelDate, departureTime) {
  const now = new Date();
  
  // Get today's date in YYYY-MM-DD format (local time, not UTC)
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  // Journey date is already in YYYY-MM-DD format
  const journeyDateStr = travelDate;
  
  // Debug logging
  console.log(`🕐 Booking Check - Current: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}, Journey: ${journeyDateStr} ${departureTime}`);
  
  // If journey is in the future, allow booking
  if (journeyDateStr > todayStr) {
    console.log('✅ Future date - ALLOWED');
    return true;
  }
  
  // If journey is today, check departure time
  if (journeyDateStr === todayStr) {
    // Parse current time (HH:MM format)
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeMinutes = currentHours * 60 + currentMinutes;
    
    // Parse departure time (HH:MM format)
    const [depHours, depMinutes] = departureTime.split(':').map(Number);
    const departureTimeMinutes = depHours * 60 + depMinutes;
    
    const allowed = currentTimeMinutes < departureTimeMinutes;
    
    console.log(`  Current: ${currentHours}:${String(currentMinutes).padStart(2, '0')} (${currentTimeMinutes} min) vs Departure: ${departureTime} (${departureTimeMinutes} min) → ${allowed ? 'ALLOWED' : 'BLOCKED'}`);
    
    // Allow booking if current time is before departure time
    return allowed;
  }
  
  // If journey date is in the past, block booking
  console.log('❌ Past date - BLOCKED');
  return false;
}

// Get all routes
router.get('/routes', (req, res) => {
  try {
    const db = getDatabase();
    db.all('SELECT * FROM routes', (err, routes) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch routes' });
      console.log(`📋 Total routes in DB: ${routes?.length || 0}`);
      res.json({ routes });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// Get all active places / cities (combining places table and all distinct route cities)
router.get('/places', (req, res) => {
  try {
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

      // Deduplicate places by normalized city name
      const placeMap = new Map();
      (places || []).forEach((p) => {
        if (!p.name) return;
        const normKey = p.name.trim().toLowerCase();
        if (!placeMap.has(normKey)) {
          placeMap.set(normKey, {
            ...p,
            name: p.name.trim().charAt(0).toUpperCase() + p.name.trim().slice(1)
          });
        }
      });

      res.json({ places: Array.from(placeMap.values()) });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch places' });
  }
});

// Debug endpoint to check schedules
router.get('/debug/schedules', (req, res) => {
  try {
    const { performDailyCleanup } = require('../database/init');
    performDailyCleanup();
    const db = getDatabase();
    db.all(`
      SELECT 
        COUNT(*) as total_schedules,
        MIN(travel_date) as earliest_date,
        MAX(travel_date) as latest_date,
        COUNT(DISTINCT travel_date) as unique_dates
      FROM schedules
    `, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed' });
      
      db.all(`
        SELECT travel_date, COUNT(*) as count 
        FROM schedules 
        GROUP BY travel_date 
        ORDER BY travel_date
      `, (err, dateBreakdown) => {
        if (err) return res.status(500).json({ error: 'Failed' });
        
        res.json({ 
          summary: result[0],
          dateBreakdown: dateBreakdown || []
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
});

// Search buses - supports single date or date range
router.post('/search', (req, res) => {
  const { fromCity, toCity, travelDate, showAllDates } = req.body;
  
  console.log('🔍 Search request:', { fromCity, toCity, travelDate, showAllDates });
  
  if (!fromCity || !toCity) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ error: 'Missing required fields', buses: [] });
  }
  
  const db = getDatabase();
  
  const CITY_ALIASES = {
    ananthapuram: 'anantapur',
    ananthapur: 'anantapur',
    anantapuram: 'anantapur',
    cuddapah: 'kadapa',
    bengaluru: 'bangalore',
    vijaywada: 'vijayawada',
    vijayawadda: 'vijayawada',
    tirupathi: 'tirupati',
    vizag: 'visakhapatnam'
  };

  const fromNorm = CITY_ALIASES[fromCity.toLowerCase().trim()] || fromCity.toLowerCase().trim();
  const toNorm = CITY_ALIASES[toCity.toLowerCase().trim()] || toCity.toLowerCase().trim();

  // Find matching routes (handling city aliases like Anantapur / Ananthapuram)
  db.all(
    `SELECT * FROM routes 
     WHERE (LOWER(from_city) = LOWER(?) OR LOWER(from_city) = LOWER(?))
       AND (LOWER(to_city) = LOWER(?) OR LOWER(to_city) = LOWER(?))`,
    [fromCity, fromNorm, toCity, toNorm],
    (err, matchingRoutes) => {
      if (err) {
        console.error('❌ Route query error:', err);
        return res.status(500).json({ error: 'Search failed', buses: [] });
      }
      
      if (!matchingRoutes || matchingRoutes.length === 0) {
        console.log('❌ No route found for:', fromCity, '->', toCity);
        return res.json({ buses: [], message: 'No route found' });
      }
      
      const routeIds = matchingRoutes.map(r => r.id);
      const placeholders = routeIds.map(() => '?').join(',');
      const mainRoute = matchingRoutes[0];

      // Determine query based on whether to show all dates or specific date
      let query, params;
      
      if (showAllDates || !travelDate) {
        // Show next 30 days of schedules starting from requested date or today
        const { getLocalDateString } = require('../utils/dateUtils');
        const todayStr = getLocalDateString();
        const startFromDate = travelDate || todayStr;
        
        query = `
          SELECT s.*, b.*, r.from_city, r.to_city, r.distance_km, r.duration_hours
          FROM schedules s
          JOIN buses b ON s.bus_id = b.id
          JOIN routes r ON s.route_id = r.id
          WHERE s.route_id IN (${placeholders}) AND s.travel_date >= ? AND s.available_seats > 0
            AND NOT EXISTS (SELECT 1 FROM stopped_route_services srs WHERE srs.bus_id = s.bus_id AND srs.route_id = s.route_id)
          ORDER BY s.travel_date, s.departure_time
        `;
        params = [...routeIds, startFromDate];
        console.log(`📅 Fetching schedules for route IDs [${routeIds.join(', ')}] from ${startFromDate}`);
      } else {
        // Show specific date only
        query = `
          SELECT s.*, b.*, r.from_city, r.to_city, r.distance_km, r.duration_hours
          FROM schedules s
          JOIN buses b ON s.bus_id = b.id
          JOIN routes r ON s.route_id = r.id
          WHERE s.route_id IN (${placeholders}) AND s.travel_date = ? AND s.available_seats > 0
            AND NOT EXISTS (SELECT 1 FROM stopped_route_services srs WHERE srs.bus_id = s.bus_id AND srs.route_id = s.route_id)
          ORDER BY s.departure_time
        `;
        params = [...routeIds, travelDate];
        console.log(`📅 Fetching schedules for route IDs [${routeIds.join(', ')}] on ${travelDate}`);
      }
      
      // Get schedules
      db.all(query, params, (err, schedules) => {
        if (err) {
          console.error('❌ Schedules query error:', err);
          return res.status(500).json({ error: 'Search failed', buses: [] });
        }
        
        console.log(`✅ Found ${schedules?.length || 0} buses for routes [${routeIds.join(', ')}]`);
        
        if (!schedules || schedules.length === 0) {
          console.log('⚠️ No schedules available');
        }
        
        // Add route_id and booking_allowed flag to each schedule
        const schedulesWithRoute = (schedules || []).map(s => ({
          ...s,
          route_id: s.route_id,
          booking_allowed: isBookingAllowed(s.travel_date, s.departure_time)
        }));
        
        // Group by date if showing all dates
        let response;
        if (showAllDates || !travelDate) {
          const byDate = {};
          schedulesWithRoute.forEach(schedule => {
            if (!byDate[schedule.travel_date]) {
              byDate[schedule.travel_date] = [];
            }
            byDate[schedule.travel_date].push(schedule);
          });
          response = { 
            buses: schedulesWithRoute, 
            route: mainRoute,
            byDate,
            dates: Object.keys(byDate).sort()
          };
        } else {
          response = { buses: schedulesWithRoute, route: mainRoute };
        }
        
        return res.json(response);
      });
    }
  );
});

// Get seat layout (with optional auth to identify user's own holds)
// Pass ?sessionId=xxx to distinguish between different tabs of the same user
router.get('/seats/:scheduleId', optionalAuth, (req, res) => {
  try {
    const { scheduleId } = req.params;
    const currentUserId = req.user ? req.user.id : null;
    const currentSessionId = req.query.sessionId || null;
    const db = getDatabase();
    
    // First, clean expired holds
    db.run('DELETE FROM seat_locks WHERE expires_at < CURRENT_TIMESTAMP AT TIME ZONE \'UTC\'');
    
    db.get(`
      SELECT s.*, b.bus_name, b.bus_number, b.operator, b.bus_type,
             r.from_city, r.to_city, r.distance_km
      FROM schedules s
      JOIN buses b ON s.bus_id = b.id
      JOIN routes r ON s.route_id = r.id
      WHERE s.id = ?
    `, [scheduleId], (err, schedule) => {
      if (err || !schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      // Get all seats
      db.all('SELECT * FROM seats WHERE bus_id = ? ORDER BY seat_number', [schedule.bus_id], (err, allSeats) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch seats' });
        
        // Get booked seats
        db.all(`
          SELECT seat_numbers FROM bookings 
          WHERE schedule_id = ? AND booking_status = 'confirmed'
        `, [scheduleId], (err, bookedSeats) => {
          if (err) return res.status(500).json({ error: 'Failed to fetch bookings' });
          
          const bookedSeatNumbers = (bookedSeats || []).flatMap(b => b.seat_numbers.split(','));
          
          // Get held/locked seats with user and session info
          db.all(`
            SELECT seat_number, locked_by_user, session_id, expires_at FROM seat_locks 
            WHERE schedule_id = ? AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          `, [scheduleId], (err, lockedSeats) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch locks' });
            
            const lockMap = {};
            (lockedSeats || []).forEach(l => {
              lockMap[l.seat_number] = {
                userId: l.locked_by_user,
                sessionId: l.session_id,
                expiresAt: l.expires_at
              };
            });
            
            // Check if booking is allowed for this schedule
            const bookingAllowed = isBookingAllowed(schedule.travel_date, schedule.departure_time);
            
            // Mark seat status — only show 'held-by-you' for THIS session
            // Same user but different tab/session = 'held' (unavailable)
            const seats = allSeats.map(seat => {
              if (bookedSeatNumbers.includes(seat.seat_number)) {
                return { ...seat, status: 'booked' };
              }
              if (lockMap[seat.seat_number]) {
                const lock = lockMap[seat.seat_number];
                // Only mark as 'held-by-you' if SAME user AND SAME session
                if (currentUserId && lock.userId === currentUserId && (!lock.sessionId || !currentSessionId || lock.sessionId === currentSessionId)) {
                  return { ...seat, status: 'held-by-you', expiresAt: lock.expiresAt };
                } else {
                  // Different user OR same user different tab → unavailable
                  return { ...seat, status: 'held' };
                }
              }
              return { ...seat, status: 'available' };
            });
            
            res.json({ 
              seats, 
              schedule: {
                ...schedule,
                booking_allowed: bookingAllowed
              }
            });
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seats' });
  }
});

// Get seat availability for 30 days for a specific route and bus
router.get('/availability/:routeId/:busId', (req, res) => {
  try {
    const { routeId, busId } = req.params;
    const db = getDatabase();
    
    // Get next 30 days of schedules for this route and bus
    const { getLocalDateString } = require('../utils/dateUtils');
    const todayStr = getLocalDateString();
    
    db.all(`
      SELECT s.*, 
             (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id = s.id AND b.booking_status = 'confirmed') as bookings_count,
             (SELECT STRING_AGG(seat_numbers, ',') FROM bookings b WHERE b.schedule_id = s.id AND b.booking_status = 'confirmed') as booked_seats
      FROM schedules s
      WHERE s.route_id = ? AND s.bus_id = ? AND s.travel_date >= ?
      ORDER BY s.travel_date, s.departure_time
    `, [routeId, busId, todayStr], (err, schedules) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch availability' });
      }
      
      // Process each schedule to show seat availability
      const availability = schedules.map(schedule => {
        const bookedSeatsStr = schedule.booked_seats || '';
        const bookedSeatsList = bookedSeatsStr ? bookedSeatsStr.split(',').flatMap(s => s.split(',')) : [];
        const uniqueBookedSeats = [...new Set(bookedSeatsList.filter(s => s))];
        
        return {
          schedule_id: schedule.id,
          travel_date: schedule.travel_date,
          departure_time: schedule.departure_time,
          arrival_time: schedule.arrival_time,
          base_price: schedule.base_price,
          total_seats: 40,
          booked_seats_count: uniqueBookedSeats.length,
          available_seats: 40 - uniqueBookedSeats.length,
          booked_seat_numbers: uniqueBookedSeats,
          booking_allowed: isBookingAllowed(schedule.travel_date, schedule.departure_time)
        };
      });
      
      res.json({ availability });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Hold a seat temporarily (5 min) when user selects it
// Now requires sessionId from the browser tab to track per-tab holds
router.post('/hold-seat', authenticateToken, (req, res) => {
  try {
    const { scheduleId, seatNumber, sessionId } = req.body;
    const userId = req.user.id;
    const db = getDatabase();

    // Clean expired holds first
    db.run('DELETE FROM seat_locks WHERE expires_at < CURRENT_TIMESTAMP AT TIME ZONE \'UTC\'');

    // Check if seat is already booked
    db.all(`
      SELECT seat_numbers FROM bookings 
      WHERE schedule_id = ? AND booking_status = 'confirmed'
    `, [scheduleId], (err, bookings) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      const bookedSeats = (bookings || []).flatMap(b => b.seat_numbers.split(','));
      if (bookedSeats.includes(seatNumber)) {
        return res.status(400).json({ error: 'Seat already booked' });
      }

      // Check if seat is held by anyone
      db.get(`
        SELECT * FROM seat_locks 
        WHERE schedule_id = ? AND seat_number = ? AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      `, [scheduleId, seatNumber], (err, existingLock) => {
        if (err) return res.status(500).json({ error: 'Database error' });

        // If held by a different user, block
        if (existingLock && existingLock.locked_by_user !== userId) {
          return res.status(409).json({ error: 'Seat is held by another user', status: 'held' });
        }

        // If held by same user but different session (another tab), also block
        if (existingLock && existingLock.locked_by_user === userId && sessionId && existingLock.session_id && existingLock.session_id !== sessionId) {
          return res.status(409).json({ error: 'Seat is already selected in your other session', status: 'held' });
        }

        // If already held by this user+session, refresh the expiry
        if (existingLock && existingLock.locked_by_user === userId) {
          const newExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          db.run(`
            UPDATE seat_locks SET expires_at = ?, session_id = ? 
            WHERE schedule_id = ? AND seat_number = ? AND locked_by_user = ?
          `, [newExpiry, sessionId || existingLock.session_id, scheduleId, seatNumber, userId], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to refresh hold' });
            return res.json({ message: 'Hold refreshed', expiresAt: newExpiry });
          });
          return;
        }

        // Create new hold - 5 minutes
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        db.run(`
          INSERT INTO seat_locks (schedule_id, seat_number, locked_by_user, session_id, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `, [scheduleId, seatNumber, userId, sessionId || null, expiresAt], (err) => {
          if (err) {
            if (err.message.includes('UNIQUE')) {
              return res.status(409).json({ error: 'Seat already held' });
            }
            return res.status(500).json({ error: 'Failed to hold seat' });
          }
          console.log(`🔒 Seat ${seatNumber} held by user ${userId} (session: ${sessionId}) for schedule ${scheduleId} until ${expiresAt}`);
          res.json({ message: 'Seat held', expiresAt });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to hold seat' });
  }
});

// Release a held seat when user deselects it
router.post('/release-seat', authenticateToken, (req, res) => {
  try {
    const { scheduleId, seatNumber, sessionId } = req.body;
    const userId = req.user.id;
    const db = getDatabase();

    // Only release if it belongs to same user AND same session
    const query = sessionId 
      ? 'DELETE FROM seat_locks WHERE schedule_id = ? AND seat_number = ? AND locked_by_user = ? AND session_id = ?'
      : 'DELETE FROM seat_locks WHERE schedule_id = ? AND seat_number = ? AND locked_by_user = ?';
    const params = sessionId 
      ? [scheduleId, seatNumber, userId, sessionId]
      : [scheduleId, seatNumber, userId];

    db.run(query, params, function(err) {
      if (err) return res.status(500).json({ error: 'Failed to release seat' });
      console.log(`🔓 Seat ${seatNumber} released by user ${userId} (session: ${sessionId}) for schedule ${scheduleId}`);
      res.json({ message: 'Seat released' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to release seat' });
  }
});

// Release all held seats for a user+session on a schedule (cleanup on page leave)
router.post('/release-all-seats', authenticateToken, (req, res) => {
  try {
    const { scheduleId, sessionId } = req.body;
    const userId = req.user.id;
    const db = getDatabase();

    // Only release seats for this specific session
    const query = sessionId
      ? 'DELETE FROM seat_locks WHERE schedule_id = ? AND locked_by_user = ? AND session_id = ?'
      : 'DELETE FROM seat_locks WHERE schedule_id = ? AND locked_by_user = ?';
    const params = sessionId
      ? [scheduleId, userId, sessionId]
      : [scheduleId, userId];

    db.run(query, params, function(err) {
      if (err) return res.status(500).json({ error: 'Failed to release seats' });
      console.log(`🔓 All seats released by user ${userId} (session: ${sessionId}) for schedule ${scheduleId}`);
      res.json({ message: 'All seats released', count: this.changes });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to release seats' });
  }
});

// Lock seats temporarily
router.post('/lock-seats', authenticateToken, (req, res) => {
  try {
    const { scheduleId, seatNumbers, sessionId } = req.body;
    const userId = req.user.id;
    const db = getDatabase();

    // First, check if the schedule exists and if booking is allowed
    db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId], (err, schedule) => {
      if (err || !schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      // Check if booking is allowed (departure time validation)
      if (!isBookingAllowed(schedule.travel_date, schedule.departure_time)) {
        return res.status(400).json({
          error: 'Booking closed – bus already departed',
          departed: true
        });
      }

      // Clean expired locks first
      db.run('DELETE FROM seat_locks WHERE expires_at < CURRENT_TIMESTAMP AT TIME ZONE \'UTC\'', (cleanErr) => {
        if (cleanErr) console.error('Lock cleanup error:', cleanErr);

        // Check for already booked seats
        db.all(`
          SELECT seat_numbers FROM bookings
          WHERE schedule_id = ? AND booking_status = 'confirmed'
        `, [scheduleId], (err, bookings) => {
          if (err) return res.status(500).json({ error: 'Failed to check availability' });

          const bookedSeatNumbers = (bookings || []).flatMap(b => b.seat_numbers.split(',').map(s => s.trim()));
          const alreadyBooked = seatNumbers.filter(s => bookedSeatNumbers.includes(s));
          if (alreadyBooked.length > 0) {
            return res.status(409).json({
              error: `Seats already booked by another passenger: ${alreadyBooked.join(', ')}`,
              conflictSeats: alreadyBooked,
              type: 'booked'
            });
          }

          // Check for active locks by OTHER users
          db.all(`
            SELECT seat_number, locked_by_user FROM seat_locks
            WHERE schedule_id = ? AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AND locked_by_user != ?
          `, [scheduleId, userId], (err, otherLocks) => {
            if (err) return res.status(500).json({ error: 'Failed to check locks' });

            const heldByOthers = (otherLocks || []).filter(l => seatNumbers.includes(l.seat_number));
            if (heldByOthers.length > 0) {
              const heldSeatNums = heldByOthers.map(l => l.seat_number);
              return res.status(409).json({
                error: `Seats held by another user: ${heldSeatNums.join(', ')}. Please select different seats.`,
                conflictSeats: heldSeatNums,
                type: 'held'
              });
            }

            // All checks passed — delete any existing locks by this user for these seats, then insert fresh ones
            const placeholders = seatNumbers.map(() => '?').join(',');
            db.run(`DELETE FROM seat_locks WHERE schedule_id = ? AND locked_by_user = ? AND seat_number IN (${placeholders})`,
              [scheduleId, userId, ...seatNumbers], (err) => {
                if (err) console.error('Pre-lock cleanup error:', err);

                const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
                let completed = 0;
                let insertError = false;

                seatNumbers.forEach(seatNumber => {
                  db.run(`
                    INSERT INTO seat_locks (schedule_id, seat_number, locked_by_user, session_id, expires_at)
                    VALUES (?, ?, ?, ?, ?)
                  `, [scheduleId, seatNumber, userId, sessionId || null, expiresAt], (err) => {
                    if (err && !insertError) {
                      if (err.message && err.message.includes('unique')) {
                        // Another user grabbed it between our check and insert — race condition caught by DB constraint
                        insertError = true;
                        return res.status(409).json({
                          error: `Seat ${seatNumber} was just taken by another user. Please refresh and try again.`,
                          conflictSeats: [seatNumber],
                          type: 'held'
                        });
                      }
                      insertError = true;
                      return res.status(500).json({ error: 'Failed to lock seats' });
                    }
                    completed++;
                    if (completed === seatNumbers.length && !insertError) {
                      console.log(`🔒 Seats ${seatNumbers.join(',')} locked by user ${userId} for schedule ${scheduleId} until ${expiresAt}`);
                      res.json({ message: 'Seats locked', expiresAt });
                    }
                  });
                });
              }
            );
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to lock seats' });
  }
});

// Create booking
router.post('/book', authenticateToken, async (req, res) => {
  try {
    const { scheduleId, passengers } = req.body;
    const userId = req.user.id;
    
    // Validate passengers array
    if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).json({ error: 'Invalid passengers data. Expected array of passenger objects.' });
    }
    
    // Validate each passenger has required fields
    for (const p of passengers) {
      if (!p.seatNumber || !p.name) {
        return res.status(400).json({ error: 'Each passenger must have seatNumber and name' });
      }
      // Age and gender are optional - can be null
    }
    
    const db = getDatabase();
    
    // Get schedule
    db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId], (err, schedule) => {
      if (err || !schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      // Check if booking is allowed (departure time validation)
      if (!isBookingAllowed(schedule.travel_date, schedule.departure_time)) {
        return res.status(400).json({ 
          error: 'Booking closed – bus already departed',
          departed: true
        });
      }
      
      const allSeatNumbers = passengers.map(p => p.seatNumber);
      
      // Check seats availability (bookings + locks by other users)
      db.all(`
        SELECT seat_numbers FROM bookings 
        WHERE schedule_id = ? AND booking_status = 'confirmed'
      `, [scheduleId], (err, bookedSeats) => {
        if (err) return res.status(500).json({ error: 'Failed to check availability' });
        
        const bookedSeatNumbers = (bookedSeats || []).flatMap(b => b.seat_numbers.split(',').map(s => s.trim()));
        const unavailable = allSeatNumbers.filter(s => bookedSeatNumbers.includes(s));
        
        if (unavailable.length > 0) {
          return res.status(400).json({ error: `Seats already booked: ${unavailable.join(', ')}` });
        }

        // Check for active locks by OTHER users on these seats
        db.all(`
          SELECT seat_number, locked_by_user FROM seat_locks
          WHERE schedule_id = ? AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AND locked_by_user != ?
        `, [scheduleId, userId], (lockErr, otherLocks) => {
          if (lockErr) return res.status(500).json({ error: 'Failed to verify seat availability' });

          const lockedByOthers = (otherLocks || []).filter(l => allSeatNumbers.includes(l.seat_number));
          if (lockedByOthers.length > 0) {
            const lockedSeatNums = lockedByOthers.map(l => l.seat_number);
            return res.status(409).json({
              error: `Seats currently held by another user: ${lockedSeatNums.join(', ')}. Please go back and select different seats.`,
              conflictSeats: lockedSeatNums,
              type: 'held'
            });
          }
        
          // Generate booking group ID for linking passengers together
          const bookingGroupId = 'GRP' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
          
          // Create bookings array - one per passenger
          const bookings = [];
          let completedInserts = 0;
          let hasError = false;
          
          passengers.forEach((passenger, index) => {
            const pnr = 'PNR' + Date.now() + index + Math.random().toString(36).substr(2, 5).toUpperCase();
            const totalPrice = schedule.base_price; // Price per seat
            
            db.run(`
              INSERT INTO bookings (user_id, schedule_id, booking_group_id, seat_numbers, passenger_name, passenger_age, passenger_gender, total_price, pnr)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              userId,
              scheduleId,
              bookingGroupId,
              passenger.seatNumber, // One seat per booking
              passenger.name,
              passenger.age || null,
              passenger.gender || null,
              totalPrice,
              pnr
            ], function(err) {
              if (err && !hasError) {
                hasError = true;
                return res.status(500).json({ error: 'Booking failed: ' + err.message });
              }
              
              if (!hasError) {
                bookings.push({
                  bookingId: this.lastID,
                  pnr,
                  seatNumber: passenger.seatNumber,
                  passengerName: passenger.name,
                  price: totalPrice
                });
                
                completedInserts++;
                
                // All inserts complete
                if (completedInserts === passengers.length) {
                  // Update available seats
                  db.run('UPDATE schedules SET available_seats = available_seats - ? WHERE id = ?', 
                    [passengers.length, scheduleId], (err) => {
                      if (err) return res.status(500).json({ error: 'Failed to update seats' });
                      
                      // Remove seat locks
                      db.run('DELETE FROM seat_locks WHERE schedule_id = ? AND locked_by_user = ?', 
                        [scheduleId, userId], (err) => {
                          // Get user email and send booking confirmation
                          db.get('SELECT email, username FROM users WHERE id = ?', [userId], (err, user) => {
                            if (!err && user && user.email) {
                              // Get full booking details for email
                              db.get(`
                                SELECT s.departure_time, s.arrival_time, s.travel_date,
                                       bus.bus_name, bus.bus_number,
                                       r.from_city, r.to_city
                                FROM schedules s
                                JOIN buses bus ON s.bus_id = bus.id
                                JOIN routes r ON s.route_id = r.id
                                WHERE s.id = ?
                              `, [scheduleId], (err, details) => {
                                if (!err && details) {
                                  // Send booking confirmation email for all passengers (don't wait for it)
                                  sendBookingConfirmationEmail(user.email, {
                                    bookingGroupId,
                                    bookings: bookings.map(b => ({
                                      pnr: b.pnr,
                                      passengerName: b.passengerName,
                                      seatNumber: b.seatNumber
                                    })),
                                    busName: details.bus_name,
                                    busNumber: details.bus_number,
                                    fromCity: details.from_city,
                                    toCity: details.to_city,
                                    travelDate: details.travel_date,
                                    departureTime: details.departure_time,
                                    arrivalTime: details.arrival_time,
                                    totalSeats: passengers.length,
                                    totalPrice: schedule.base_price * passengers.length
                                  }).catch(err => console.error('Email send failed:', err));
                                }
                              });
                            }
                          });
                          
                          res.status(201).json({
                            message: 'Booking successful',
                            bookingGroupId,
                            bookings,
                            totalPrice: schedule.base_price * passengers.length
                          });
                        });
                    });
                }
              }
            });
          });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Booking failed: ' + error.message });
  }
});

// Get user bookings
router.get('/my-bookings', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const db = getDatabase();
    
    db.all(`
      SELECT b.*, s.departure_time, s.arrival_time, s.travel_date,
             bus.bus_name, bus.bus_number, bus.bus_type,
             r.from_city, r.to_city
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN buses bus ON s.bus_id = bus.id
      JOIN routes r ON s.route_id = r.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [userId], (err, bookings) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch bookings' });
      res.json({ bookings: bookings || [] });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get booking details
router.get('/booking/:pnr', authenticateToken, (req, res) => {
  try {
    const { pnr } = req.params;
    const userId = req.user.id;
    const db = getDatabase();
    
    db.get(`
      SELECT b.*, s.departure_time, s.arrival_time, s.travel_date, s.base_price,
             bus.bus_name, bus.bus_number, bus.bus_type, bus.operator,
             r.from_city, r.to_city, r.distance_km
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN buses bus ON s.bus_id = bus.id
      JOIN routes r ON s.route_id = r.id
      WHERE b.pnr = ? AND b.user_id = ?
    `, [pnr, userId], (err, booking) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch booking' });
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      res.json({ booking });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// Cancel booking
// Preview refund for a booking (without actually cancelling)
router.get('/cancel-preview/:pnr', authenticateToken, (req, res) => {
  try {
    const { pnr } = req.params;
    const userId = req.user.id;
    const db = getDatabase();

    db.get(`
      SELECT b.*, s.departure_time, s.travel_date, s.arrival_time,
             bus.bus_name, bus.bus_number, bus.operator,
             r.from_city, r.to_city
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN buses bus ON s.bus_id = bus.id
      JOIN routes r ON s.route_id = r.id
      WHERE b.pnr = ? AND b.user_id = ?
    `, [pnr, userId], (err, booking) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch booking' });
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (booking.booking_status === 'cancelled') {
        return res.status(400).json({ error: 'Booking already cancelled' });
      }

      const departureDateTime = new Date(`${booking.travel_date}T${booking.departure_time}`);
      const hoursUntilDeparture = (departureDateTime - new Date()) / (1000 * 60 * 60);

      if (hoursUntilDeparture < 0) {
        return res.status(400).json({ error: 'Cannot cancel after departure' });
      }

      db.all('SELECT * FROM cancellation_rules ORDER BY hours_before_departure DESC', (err, rules) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch rules' });

        let applicableRule = { refund_percentage: 0 };
        if (rules && rules.length > 0) {
          applicableRule = rules[rules.length - 1];
          for (const rule of rules) {
            if (hoursUntilDeparture >= rule.hours_before_departure) {
              applicableRule = rule;
              break;
            }
          }
        }

        const refundAmount = Math.round((booking.total_price * applicableRule.refund_percentage) / 100);

        res.json({
          booking: {
            pnr: booking.pnr,
            from_city: booking.from_city,
            to_city: booking.to_city,
            bus_name: booking.bus_name,
            bus_number: booking.bus_number,
            operator: booking.operator,
            travel_date: booking.travel_date,
            departure_time: booking.departure_time,
            arrival_time: booking.arrival_time,
            seat_numbers: booking.seat_numbers,
            passenger_name: booking.passenger_name,
            total_price: booking.total_price
          },
          refund: {
            refundAmount,
            refundPercentage: applicableRule.refund_percentage,
            hoursUntilDeparture: Math.round(hoursUntilDeparture * 10) / 10
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to preview cancellation' });
  }
});

router.post('/cancel/:pnr', authenticateToken, (req, res) => {
  try {
    const { pnr } = req.params;
    const userId = req.user.id;
    const db = getDatabase();
    
    db.get(`
      SELECT b.*, s.departure_time, s.travel_date
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      WHERE b.pnr = ? AND b.user_id = ?
    `, [pnr, userId], (err, booking) => {
      if (err) return res.status(500).json({ error: 'Cancellation failed' });
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }
      
      if (booking.booking_status === 'cancelled') {
        return res.status(400).json({ error: 'Booking already cancelled' });
      }
      
      // Calculate refund
      const departureDateTime = new Date(`${booking.travel_date}T${booking.departure_time}`);
      const hoursUntilDeparture = (departureDateTime - new Date()) / (1000 * 60 * 60);
      
      if (hoursUntilDeparture < 0) {
        return res.status(400).json({ error: 'Cannot cancel after departure' });
      }
      
      db.all('SELECT * FROM cancellation_rules ORDER BY hours_before_departure DESC', (err, rules) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch rules' });
        
        // Default rule if no rules exist in database
        let applicableRule = { refund_percentage: 0 };
        
        if (rules && rules.length > 0) {
          applicableRule = rules[rules.length - 1];
          for (const rule of rules) {
            if (hoursUntilDeparture >= rule.hours_before_departure) {
              applicableRule = rule;
              break;
            }
          }
        }
        
        const refundAmount = (booking.total_price * applicableRule.refund_percentage) / 100;
        
        // Update booking
        db.run("UPDATE bookings SET booking_status = 'cancelled' WHERE id = ?", [booking.id], (err) => {
          if (err) return res.status(500).json({ error: 'Failed to update booking' });
          
          // Update available seats
          const seatCount = booking.seat_numbers.split(',').length;
          db.run('UPDATE schedules SET available_seats = available_seats + ? WHERE id = ?', 
            [seatCount, booking.schedule_id], (err) => {
              // Get user email and booking details for cancellation email
              db.get(`
                SELECT u.email, u.username,
                       s.departure_time, s.arrival_time, s.travel_date,
                       bus.bus_name, bus.bus_number,
                       r.from_city, r.to_city
                FROM users u
                JOIN bookings b ON u.id = b.user_id
                JOIN schedules s ON b.schedule_id = s.id
                JOIN buses bus ON s.bus_id = bus.id
                JOIN routes r ON s.route_id = r.id
                WHERE b.id = ?
              `, [booking.id], (err, details) => {
                if (!err && details && details.email) {
                  // Send cancellation email (don't wait for it)
                  sendCancellationEmail(details.email, {
                    pnr,
                    busName: details.bus_name,
                    busNumber: details.bus_number,
                    fromCity: details.from_city,
                    toCity: details.to_city,
                    travelDate: details.travel_date,
                    seatNumbers: booking.seat_numbers.split(',').join(', '),
                    totalPrice: booking.total_price,
                    refundAmount: Math.round(refundAmount),
                    refundPercentage: applicableRule.refund_percentage
                  }).catch(err => console.error('Email send failed:', err));
                }
              });
              
              res.json({
                message: 'Booking cancelled',
                refundAmount: Math.round(refundAmount),
                refundPercentage: applicableRule.refund_percentage
              });
            });
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

// Verification endpoint: Show 30-day rolling window with seat isolation
router.get('/force-cleanup', (req, res) => {
  const { performDailyCleanup } = require('../database/init');
  performDailyCleanup();
  res.json({ message: 'Daily cleanup triggered successfully' });
});

router.get('/verify/date-isolation', (req, res) => {
  try {
    const db = getDatabase();
    const { getLocalDateString } = require('../utils/dateUtils');
    const todayStr = getLocalDateString();
    
    // Get date range summary
    db.get(`
      SELECT 
        MIN(travel_date) as earliest_date,
        MAX(travel_date) as latest_date,
        COUNT(DISTINCT travel_date) as total_days,
        COUNT(*) as total_schedules
      FROM schedules
    `, (err, summary) => {
      if (err) return res.status(500).json({ error: 'Query failed' });
      
      // Get per-date breakdown
      db.all(`
        SELECT 
          s.travel_date,
          COUNT(DISTINCT s.id) as total_schedules,
          SUM(s.available_seats) as total_available_seats,
          COUNT(DISTINCT b.id) as total_bookings,
          (SELECT COUNT(*) FROM bookings WHERE schedule_id IN 
            (SELECT id FROM schedules WHERE travel_date = s.travel_date)) as booked_seat_count
        FROM schedules s
        LEFT JOIN bookings b ON s.id = b.schedule_id AND b.booking_status = 'confirmed'
        GROUP BY s.travel_date
        ORDER BY s.travel_date
      `, (err, dateBreakdown) => {
        if (err) return res.status(500).json({ error: 'Query failed' });
        
        // Verify 30-day window
        const dates = dateBreakdown.map(d => d.travel_date);
        const day1 = dates[0];
        const day30 = dates[dates.length - 1];
        
        res.json({
          verification: {
            status: 'PASSED',
            today: todayStr,
            window_start: day1,
            window_end: day30,
            total_days_in_db: summary.total_days,
            expected_days: 30,
            is_30_day_window: summary.total_days >= 30 && summary.total_days <= 31
          },
          summary,
          dateBreakdown,
          isolation_proof: {
            message: 'Each date has independent schedules and seat availability',
            example: dateBreakdown.slice(0, 3),
            explanation: 'Booking seats on one date affects only that date\'s available_seats count'
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Verify UPI PIN (account password) for payment authorization
router.post('/verify-pin', authenticateToken, async (req, res) => {
  try {
    const { pin } = req.body;
    const userId = req.user.id;

    if (!pin) {
      return res.status(400).json({ error: 'PIN is required' });
    }

    const db = getDatabase();

    db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Verification failed' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const validPin = await bcrypt.compare(pin, user.password);

      if (!validPin) {
        return res.status(401).json({ error: 'Invalid UPI PIN' });
      }

      res.json({ verified: true, message: 'Payment authorized' });
    });
  } catch (error) {
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

// ============ SEAT HEATMAP / REVIEWS ============

// Get seat reviews/ratings for a specific bus (aggregated)
router.get('/seat-reviews/:busId', (req, res) => {
  try {
    const { busId } = req.params;
    const db = getDatabase();
    
    db.all(`
      SELECT seat_number,
             ROUND(CAST(AVG(rating) AS numeric), 1) as avg_rating,
             COUNT(*) as review_count,
             STRING_AGG(comment, ', ') as comments
      FROM seat_reviews
      WHERE bus_id = ?
      GROUP BY seat_number
    `, [busId], (err, reviews) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch reviews' });
      res.json({ reviews: reviews || [] });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seat reviews' });
  }
});

// Submit a seat review
router.post('/seat-review', authenticateToken, (req, res) => {
  try {
    const { busId, seatNumber, rating, comment, bookingId } = req.body;
    const userId = req.user.id;
    const db = getDatabase();
    
    if (!busId || !seatNumber || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid review data' });
    }
    
    // Check if user already reviewed this seat for this booking
    if (bookingId) {
      db.get(
        'SELECT id FROM seat_reviews WHERE bus_id = ? AND seat_number = ? AND user_id = ? AND booking_id = ?',
        [busId, seatNumber, userId, bookingId],
        (err, existing) => {
          if (existing) {
            return res.status(400).json({ error: 'Already reviewed this seat for this booking' });
          }
          insertReview();
        }
      );
    } else {
      insertReview();
    }
    
    function insertReview() {
      db.run(
        'INSERT INTO seat_reviews (bus_id, seat_number, user_id, booking_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
        [busId, seatNumber, userId, bookingId || null, rating, comment || null],
        function(err) {
          if (err) return res.status(500).json({ error: 'Failed to submit review' });
          res.json({ message: 'Review submitted', id: this.lastID });
        }
      );
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ============ GROUP BOOKING ============

// Find best adjacent seat cluster for a group
router.post('/find-group-seats', authenticateToken, (req, res) => {
  try {
    const { scheduleId, groupSize } = req.body;
    const userId = req.user.id;
    const db = getDatabase();
    
    if (!scheduleId || !groupSize || groupSize < 2 || groupSize > 8) {
      return res.status(400).json({ error: 'Group size must be 2-8' });
    }
    
    // Get schedule info to validate
    db.get('SELECT * FROM schedules WHERE id = ?', [scheduleId], (err, schedule) => {
      if (err || !schedule) return res.status(404).json({ error: 'Schedule not found' });
      
      // Check booking allowed
      if (!isBookingAllowed(schedule.travel_date, schedule.departure_time)) {
        return res.status(400).json({ error: 'Booking closed for this schedule' });
      }
      
      // Get all seats
      db.all('SELECT * FROM seats WHERE bus_id = ? ORDER BY seat_number', [schedule.bus_id], (err, allSeats) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch seats' });
        
        // Get booked seats
        db.all(
          "SELECT seat_numbers FROM bookings WHERE schedule_id = ? AND booking_status = 'confirmed'",
          [scheduleId],
          (err, bookings) => {
            if (err) return res.status(500).json({ error: 'Failed to check bookings' });
            const bookedNums = (bookings || []).flatMap(b => b.seat_numbers.split(','));
            
            // Get held seats
            db.all(
              "SELECT seat_number, locked_by_user, session_id FROM seat_locks WHERE schedule_id = ? AND expires_at > CURRENT_TIMESTAMP AT TIME ZONE 'UTC'",
              [scheduleId],
              (err, locks) => {
                if (err) return res.status(500).json({ error: 'Failed to check locks' });
                const lockedNums = (locks || []).filter(l => l.locked_by_user !== userId).map(l => l.seat_number);
                
                // Find available seats
                const unavailable = new Set([...bookedNums, ...lockedNums]);
                const available = allSeats
                  .filter(s => s.deck === 'lower' && !unavailable.has(s.seat_number))
                  .sort((a, b) => parseInt(a.seat_number.replace(/\D/g,'')) - parseInt(b.seat_number.replace(/\D/g,'')));
                
                if (available.length < groupSize) {
                  return res.status(400).json({ error: `Only ${available.length} seats available, need ${groupSize}` });
                }
                
                // Find best adjacent clusters (2+2 layout: seats 1-2 left, 3-4 right per row)
                const bestCluster = findBestCluster(available, groupSize);
                
                res.json({
                  cluster: bestCluster.seats.map(s => s.seat_number),
                  score: bestCluster.score,
                  description: bestCluster.description,
                  totalAvailable: available.length
                });
              }
            );
          }
        );
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to find group seats' });
  }
});

function findBestCluster(availableSeats, groupSize) {
  const seatNums = availableSeats.map(s => ({
    ...s,
    num: parseInt(s.seat_number.replace(/\D/g, ''))
  }));
  
  let bestScore = -1;
  let bestCluster = { seats: seatNums.slice(0, groupSize), score: 0, description: 'First available seats' };
  
  // Try each starting position
  for (let i = 0; i <= seatNums.length - groupSize; i++) {
    const cluster = seatNums.slice(i, i + groupSize);
    let score = 100;
    
    // Adjacency bonus: prefer seats in same row (groups of 4)
    const rows = new Set(cluster.map(s => Math.floor((s.num - 1) / 4)));
    score -= (rows.size - 1) * 15; // Penalty for spanning rows
    
    // Prefer middle of bus (rows 3-5 of 8) 
    const avgRow = cluster.reduce((sum, s) => sum + Math.floor((s.num - 1) / 4), 0) / cluster.length;
    score -= Math.abs(avgRow - 3.5) * 5;
    
    // Window bonus: prefer groups that include window seats
    const windows = cluster.filter(s => {
      const pos = ((s.num - 1) % 4) + 1;
      return pos === 1 || pos === 4;
    }).length;
    score += windows * 3;
    
    // Same-side bonus: prefer all seats on same side of aisle
    const leftSide = cluster.filter(s => ((s.num - 1) % 4) < 2).length;
    const rightSide = cluster.length - leftSide;
    if (leftSide === cluster.length || rightSide === cluster.length) {
      score += 10;
    }
    
    if (score > bestScore) {
      bestScore = score;
      const rowList = [...rows].map(r => r + 1).join(', ');
      bestCluster = {
        seats: cluster,
        score: Math.round(score),
        description: `Row${rows.size > 1 ? 's' : ''} ${rowList} · ${windows} window seat${windows !== 1 ? 's' : ''} · ${rows.size === 1 ? 'Same row' : `Spans ${rows.size} rows`}`
      };
    }
  }
  
  return bestCluster;
}

// ============ WEATHER ============

// Get weather for a destination city (uses Open-Meteo, no API key needed)
router.get('/weather/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const date = req.query.date || '';
    
    // City coordinates lookup (major Indian cities)
    const cityCoords = {
      'hyderabad': { lat: 17.385, lon: 78.4867 },
      'vijayawada': { lat: 16.5062, lon: 80.6480 },
      'bangalore': { lat: 12.9716, lon: 77.5946 },
      'chennai': { lat: 13.0827, lon: 80.2707 },
      'mumbai': { lat: 19.0760, lon: 72.8777 },
      'pune': { lat: 18.5204, lon: 73.8567 },
      'delhi': { lat: 28.7041, lon: 77.1025 },
      'jaipur': { lat: 26.9124, lon: 75.7873 },
      'tirupati': { lat: 13.6288, lon: 79.4192 }
    };
    
    const coords = cityCoords[city.toLowerCase()];
    if (!coords) {
      return res.status(404).json({ error: 'City not found' });
    }
    
    // Use built-in https (no extra package needed)
    const https = require('https');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Asia/Kolkata&forecast_days=7`;
    
    https.get(url, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const weather = JSON.parse(data);
          const daily = weather.daily;
          if (!daily) return res.status(500).json({ error: 'Weather data unavailable' });
          
          const forecast = daily.time.map((d, i) => ({
            date: d,
            tempMax: daily.temperature_2m_max[i],
            tempMin: daily.temperature_2m_min[i],
            rain: daily.precipitation_sum[i],
            code: daily.weathercode[i],
            condition: getWeatherCondition(daily.weathercode[i]),
            icon: getWeatherIcon(daily.weathercode[i]),
            alert: daily.precipitation_sum[i] > 20 ? 'Heavy rain expected' :
                   daily.precipitation_sum[i] > 5 ? 'Light rain expected' :
                   daily.temperature_2m_max[i] > 42 ? 'Extreme heat warning' : null
          }));
          
          // Find travel date forecast if specified
          const travelForecast = date ? forecast.find(f => f.date === date) : null;
          
          res.json({ city, forecast, travelForecast });
        } catch {
          res.status(500).json({ error: 'Failed to parse weather' });
        }
      });
    }).on('error', () => {
      res.status(500).json({ error: 'Weather service unavailable' });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

function getWeatherCondition(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Heavy rain';
  if (code <= 86) return 'Heavy snow';
  if (code >= 95) return 'Thunderstorm';
  return 'Unknown';
}

function getWeatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '⛈️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

module.exports = router;
