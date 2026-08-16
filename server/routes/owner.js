const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');
const { authenticateToken, requireOwner, JWT_SECRET } = require('../middleware/auth');
const { sendAccountDeletionEmail, sendAdminCancellationEmail, sendServiceCancellationEmail } = require('../services/emailService');

const router = express.Router();

/**
 * POST /owner/login
 * Owner login with email and password
 */
router.post('/login', async (req, res) => {
  // Set a hard 15-second timeout so the browser never hangs forever
  const loginTimeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('Owner login TIMED OUT after 15s');
      res.status(503).json({ error: 'Login timed out. Server is slow. Please try again.' });
    }
  }, 15000);

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      clearTimeout(loginTimeout);
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDatabase();
    const normalizedEmail = email.trim().toLowerCase();

    console.log(`[Owner Login] Attempting login for: ${normalizedEmail}`);
    const t0 = Date.now();

    db.get(
      'SELECT * FROM owners WHERE LOWER(email) = ? AND is_active = 1',
      [normalizedEmail],
      async (err, owner) => {
        console.log(`[Owner Login] DB query took ${Date.now() - t0}ms`);

        if (err) {
          clearTimeout(loginTimeout);
          console.error('Owner login DB error:', err);
          return res.status(500).json({ error: 'Login failed due to database error' });
        }

        if (!owner) {
          clearTimeout(loginTimeout);
          console.log(`[Owner Login] No owner found for email: ${normalizedEmail}`);
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        try {
          const t1 = Date.now();
          const validPassword = await bcrypt.compare(password, owner.password);
          console.log(`[Owner Login] bcrypt.compare took ${Date.now() - t1}ms`);

          if (!validPassword) {
            clearTimeout(loginTimeout);
            return res.status(401).json({ error: 'Invalid credentials' });
          }

          const token = jwt.sign(
            { id: owner.id, email: owner.email, role: 'OWNER' },
            JWT_SECRET,
            { expiresIn: '24h' }
          );

          clearTimeout(loginTimeout);
          console.log(`[Owner Login] SUCCESS for ${normalizedEmail} in ${Date.now() - t0}ms`);
          return res.json({
            message: 'Login successful',
            token,
            owner: { id: owner.id, email: owner.email, name: owner.name },
          });
        } catch (bcryptErr) {
          clearTimeout(loginTimeout);
          console.error('Owner login bcrypt error:', bcryptErr);
          return res.status(500).json({ error: 'Login failed during password check' });
        }
      }
    );
  } catch (error) {
    clearTimeout(loginTimeout);
    console.error('Owner login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /owner/dashboard/stats
 * Get overall system statistics
 */
router.get('/dashboard/stats', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  
  db.serialize(() => {
    const stats = {};
    
    // Get total users
    db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
      if (err) {
        console.error('Error fetching users count:', err);
        return res.status(500).json({ error: 'Failed to fetch statistics' });
      }
      stats.totalUsers = result.count;
      
      // Get total routes
      db.get('SELECT COUNT(*) as count FROM routes', (err, result) => {
        if (err) {
          console.error('Error fetching routes count:', err);
          return res.status(500).json({ error: 'Failed to fetch statistics' });
        }
        stats.totalRoutes = result.count;

        
        // Get total buses
        db.get('SELECT COUNT(*) as count FROM buses', (err, result) => {
          if (err) {
            console.error('Error fetching buses count:', err);
            return res.status(500).json({ error: 'Failed to fetch statistics' });
          }
          stats.totalBuses = result.count;
          
          // Get total bookings
          db.get('SELECT COUNT(*) as count FROM bookings', (err, result) => {
            if (err) {
              console.error('Error fetching bookings count:', err);
              return res.status(500).json({ error: 'Failed to fetch statistics' });
            }
            stats.totalBookings = result.count;
            
            // Get today's bookings
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            
            db.get(
              `SELECT COUNT(*) as count FROM bookings 
               WHERE CAST(created_at AS DATE) = ?`,
              [todayStr],
              (err, result) => {

                if (err) {
                  console.error('Error fetching today\'s bookings:', err);
                  return res.status(500).json({ error: 'Failed to fetch statistics' });
                }
                stats.todayBookings = result.count;
                
                // Get total revenue
                db.get("SELECT SUM(total_price) as revenue FROM bookings WHERE booking_status = 'confirmed'", (err, result) => {
                  if (err) {
                    console.error('Error fetching revenue:', err);

                    return res.status(500).json({ error: 'Failed to fetch statistics' });
                  }
                  stats.totalRevenue = result.revenue || 0;
                  
                  res.json(stats);
                });
              }
            );
          });
        });
      });
    });
  });
});

/**
 * GET /owner/users
 * Get all users
 */
router.get('/users', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT 
      u.id, 
      u.username, 
      u.email, 
      u.phone, 
      u.created_at,
      COUNT(b.id) as total_bookings,
      COALESCE(SUM(b.total_price), 0) as total_spent
     FROM users u
     LEFT JOIN bookings b ON u.id = b.user_id
     GROUP BY u.id
     ORDER BY u.created_at DESC`,
    (err, users) => {
      if (err) {
        console.error('Error fetching users:', err);
        return res.status(500).json({ error: 'Failed to fetch users' });
      }
      res.json(users);
    }
  );
});

/**
 * GET /owner/routes
 * Get all routes
 */
router.get('/routes', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT 
      id,
      from_city,
      to_city,
      distance_km,
      duration_hours,
      created_at
     FROM routes
     ORDER BY from_city, to_city`,
    (err, routes) => {
      if (err) {
        console.error('Error fetching routes:', err);
        return res.status(500).json({ error: 'Failed to fetch routes' });
      }
      res.json(routes);
    }
  );
});

/**
 * GET /owner/buses
 * Get all buses
 */
router.get('/buses', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT 
      id,
      bus_number,
      bus_name,
      bus_type,
      has_ac,
      is_sleeper,
      total_seats,
      operator,
      rating,
      created_at
     FROM buses
     ORDER BY bus_number`,
    (err, buses) => {
      if (err) {
        console.error('Error fetching buses:', err);
        return res.status(500).json({ error: 'Failed to fetch buses' });
      }
      res.json(buses);
    }
  );
});

/**
 * GET /owner/bookings
 * Get all bookings with filters
 */
router.get('/bookings', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { route_id, travel_date, bus_id } = req.query;
  
  let query = `
    SELECT 
      b.id,
      b.pnr,
      b.passenger_name,
      b.passenger_age,
      b.passenger_gender,
      b.seat_numbers,
      b.total_price,
      b.booking_status,
      b.created_at,
      u.username,
      u.email,
      u.phone,
      r.from_city,
      r.to_city,
      s.travel_date,
      s.departure_time,
      s.arrival_time,
      bus.bus_number,
      bus.bus_name,
      bus.operator
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN schedules s ON b.schedule_id = s.id
    JOIN routes r ON s.route_id = r.id
    JOIN buses bus ON s.bus_id = bus.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (route_id) {
    query += ' AND s.route_id = ?';
    params.push(route_id);
  }
  
  if (travel_date) {
    query += ' AND s.travel_date = ?';
    params.push(travel_date);
  }
  
  if (bus_id) {
    query += ' AND s.bus_id = ?';
    params.push(bus_id);
  }
  
  query += ' ORDER BY b.created_at DESC';
  
  db.all(query, params, (err, bookings) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }
    res.json(bookings);
  });
});

/**
 * GET /owner/schedules
 * Get schedules for specific route and date
 */
router.get('/schedules', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { route_id, travel_date } = req.query;
  
  if (!route_id || !travel_date) {
    return res.status(400).json({ error: 'route_id and travel_date are required' });
  }
  
  db.all(
    `SELECT 
      s.id,
      s.departure_time,
      s.arrival_time,
      s.base_price,
      s.available_seats,
      s.travel_date,
      b.id as bus_id,
      b.bus_number,
      b.bus_name,
      b.bus_type,
      b.operator,
      b.total_seats,
      r.from_city,
      r.to_city
     FROM schedules s
     JOIN buses b ON s.bus_id = b.id
     JOIN routes r ON s.route_id = r.id
     WHERE s.route_id = ? AND s.travel_date = ?
     ORDER BY s.departure_time`,
    [route_id, travel_date],
    (err, schedules) => {
      if (err) {
        console.error('Error fetching schedules:', err);
        return res.status(500).json({ error: 'Failed to fetch schedules' });
      }
      res.json(schedules);
    }
  );
});

/**
 * GET /owner/seat-status
 * Get seat booking status for a specific schedule
 */
router.get('/seat-status', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { schedule_id } = req.query;
  
  if (!schedule_id) {
    return res.status(400).json({ error: 'schedule_id is required' });
  }
  
  // Get all seats for this bus
  db.get(
    `SELECT bus_id FROM schedules WHERE id = ?`,
    [schedule_id],
    (err, schedule) => {
      if (err || !schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      const busId = schedule.bus_id;
      
      // Get all seats for this bus
      db.all(
        `SELECT seat_number, seat_type, deck FROM seats WHERE bus_id = ? ORDER BY seat_number`,
        [busId],
        (err, seats) => {
          if (err) {
            console.error('Error fetching seats:', err);
            return res.status(500).json({ error: 'Failed to fetch seats' });
          }
          
          // Get booked seats for this schedule
          db.all(
            `SELECT 
              b.seat_numbers,
              b.passenger_name,
              u.username,
              u.email,
              b.pnr,
              b.booking_status
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             WHERE b.schedule_id = ?`,
            [schedule_id],
            (err, bookings) => {
              if (err) {
                console.error('Error fetching bookings:', err);
                return res.status(500).json({ error: 'Failed to fetch bookings' });
              }
              
              // Create a map of booked seats
              const bookedSeatsMap = {};
              bookings.forEach(booking => {
                const seatNumbers = booking.seat_numbers.split(',');
                seatNumbers.forEach(seatNum => {
                  bookedSeatsMap[seatNum.trim()] = {
                    passenger_name: booking.passenger_name,
                    username: booking.username,
                    email: booking.email,
                    pnr: booking.pnr,
                    booking_status: booking.booking_status
                  };
                });
              });
              
              // Build seat status array
              const seatStatus = seats.map(seat => ({
                seat_number: seat.seat_number,
                seat_type: seat.seat_type,
                deck: seat.deck,
                status: bookedSeatsMap[seat.seat_number] ? 'booked' : 'available',
                booking_info: bookedSeatsMap[seat.seat_number] || null
              }));
              
              res.json(seatStatus);
            }
          );
        }
      );
    }
  );
});

/**
 * GET /owner/available-dates
 * Get all available dates in the system
 */
router.get('/available-dates', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT DISTINCT travel_date 
     FROM schedules 
     ORDER BY travel_date`,
    (err, dates) => {
      if (err) {
        console.error('Error fetching dates:', err);
        return res.status(500).json({ error: 'Failed to fetch dates' });
      }
      res.json(dates.map(d => d.travel_date));
    }
  );
});
/**
 * GET /owner/bookings
 * Get bookings with optional filters
 */
router.get('/bookings', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { route_id, travel_date, bus_id } = req.query;
  
  let query = `
    SELECT 
      b.id,
      b.pnr,
      b.seat_numbers,
      b.passenger_name,
      b.passenger_age,
      b.passenger_gender,
      b.total_price,
      b.booking_status,
      b.created_at,
      u.username,
      u.email,
      u.phone,
      r.from_city,
      r.to_city,
      s.travel_date,
      s.departure_time,
      s.arrival_time,
      bus.bus_number,
      bus.bus_name,
      bus.operator
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    JOIN schedules s ON b.schedule_id = s.id
    JOIN routes r ON s.route_id = r.id
    JOIN buses bus ON s.bus_id = bus.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (route_id) {
    query += ' AND s.route_id = ?';
    params.push(route_id);
  }
  
  if (travel_date) {
    query += ' AND s.travel_date = ?';
    params.push(travel_date);
  }
  
  if (bus_id) {
    query += ' AND s.bus_id = ?';
    params.push(bus_id);
  }
  
  query += ' ORDER BY b.created_at DESC';
  
  db.all(query, params, (err, bookings) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }
    res.json(bookings);
  });
});

/**
 * GET /owner/schedules
 * Get schedules for specific route and date
 */
router.get('/schedules', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { route_id, travel_date } = req.query;
  
  if (!route_id || !travel_date) {
    return res.status(400).json({ error: 'route_id and travel_date are required' });
  }
  
  db.all(
    `SELECT 
      s.id,
      s.departure_time,
      s.arrival_time,
      s.base_price,
      s.available_seats,
      s.travel_date,
      b.id as bus_id,
      b.bus_number,
      b.bus_name,
      b.bus_type,
      b.operator,
      b.total_seats,
      r.from_city,
      r.to_city
     FROM schedules s
     JOIN buses b ON s.bus_id = b.id
     JOIN routes r ON s.route_id = r.id
     WHERE s.route_id = ? AND s.travel_date = ?
     ORDER BY s.departure_time`,
    [route_id, travel_date],
    (err, schedules) => {
      if (err) {
        console.error('Error fetching schedules:', err);
        return res.status(500).json({ error: 'Failed to fetch schedules' });
      }
      res.json(schedules);
    }
  );
});

/**
 * GET /owner/seat-status
 * Get seat booking status for a specific schedule
 */
router.get('/seat-status', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { schedule_id } = req.query;
  
  if (!schedule_id) {
    return res.status(400).json({ error: 'schedule_id is required' });
  }
  
  // Get all seats for this bus
  db.get(
    `SELECT bus_id FROM schedules WHERE id = ?`,
    [schedule_id],
    (err, schedule) => {
      if (err || !schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      const busId = schedule.bus_id;
      
      // Get all seats for this bus
      db.all(
        `SELECT seat_number, seat_type, deck FROM seats WHERE bus_id = ? ORDER BY seat_number`,
        [busId],
        (err, seats) => {
          if (err) {
            console.error('Error fetching seats:', err);
            return res.status(500).json({ error: 'Failed to fetch seats' });
          }
          
          // Get booked seats for this schedule
          db.all(
            `SELECT 
              b.seat_numbers,
              b.passenger_name,
              u.username,
              u.email,
              b.pnr,
              b.booking_status
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             WHERE b.schedule_id = ?`,
            [schedule_id],
            (err, bookings) => {
              if (err) {
                console.error('Error fetching bookings:', err);
                return res.status(500).json({ error: 'Failed to fetch bookings' });
              }
              
              // Create a map of booked seats
              const bookedSeatsMap = {};
              bookings.forEach(booking => {
                const seatNumbers = booking.seat_numbers.split(',');
                seatNumbers.forEach(seatNum => {
                  bookedSeatsMap[seatNum.trim()] = {
                    passenger_name: booking.passenger_name,
                    username: booking.username,
                    email: booking.email,
                    pnr: booking.pnr,
                    booking_status: booking.booking_status
                  };
                });
              });
              
              // Build seat status array
              const seatStatus = seats.map(seat => ({
                seat_number: seat.seat_number,
                seat_type: seat.seat_type,
                deck: seat.deck,
                status: bookedSeatsMap[seat.seat_number] ? 'booked' : 'available',
                booking_info: bookedSeatsMap[seat.seat_number] || null
              }));
              
              res.json(seatStatus);
            }
          );
        }
      );
    }
  );
});

/**
 * GET /owner/available-dates
 * Get all available dates in the system
 */
router.get('/available-dates', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  
  db.all(
    `SELECT DISTINCT travel_date 
     FROM schedules 
     ORDER BY travel_date`,
    (err, dates) => {
      if (err) {
        console.error('Error fetching dates:', err);
        return res.status(500).json({ error: 'Failed to fetch dates' });
      }
      res.json(dates.map(d => d.travel_date));
    }
  );
});

/**
 * DELETE /owner/buses/:id
 * Remove a bus
 */
router.delete('/buses/:id', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    // Check if bus exists
    const bus = await getAsync('SELECT id FROM buses WHERE id = ?', [id]);
    if (!bus) {
      return res.status(404).json({ error: 'Bus not found' });
    }

    const schedules = await allAsync('SELECT id FROM schedules WHERE bus_id = ?', [id]);
    const scheduleIds = schedules.map(s => s.id);

    if (scheduleIds.length > 0) {
      const placeholders = scheduleIds.map(() => '?').join(',');
      await runAsync(`DELETE FROM bookings WHERE schedule_id IN (${placeholders})`, scheduleIds);
      await runAsync(`DELETE FROM group_bookings WHERE schedule_id IN (${placeholders})`, scheduleIds);
      await runAsync(`DELETE FROM seat_locks WHERE schedule_id IN (${placeholders})`, scheduleIds);
    }

    await runAsync('DELETE FROM seat_reviews WHERE bus_id = ?', [id]);
    await runAsync('DELETE FROM seats WHERE bus_id = ?', [id]);
    await runAsync('DELETE FROM stopped_route_services WHERE bus_id = ?', [id]);
    await runAsync('DELETE FROM schedules WHERE bus_id = ?', [id]);
    await runAsync('DELETE FROM buses WHERE id = ?', [id]);

    res.json({ message: 'Bus removed successfully' });
  } catch (error) {
    console.error('Failed to delete bus:', error);
    res.status(500).json({ error: 'Failed to delete bus' });
  }
});

/**
 * DELETE /owner/users/:id
 * Remove a user
 */
router.delete('/users/:id', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  try {
    // Check if user exists
    const user = await getAsync('SELECT id, email, username FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete user dependencies
    await runAsync('DELETE FROM user_preferences WHERE user_id = ?', [id]);
    await runAsync('DELETE FROM seat_locks WHERE locked_by_user = ?', [id]);
    await runAsync('DELETE FROM seat_reviews WHERE user_id = ?', [id]);
    await runAsync('DELETE FROM group_bookings WHERE user_id = ?', [id]);
    await runAsync('DELETE FROM bookings WHERE user_id = ?', [id]);
    await runAsync('DELETE FROM conversation_sessions WHERE user_id = ?', [id]);
    
    // For dependent tables referenced by agent_tasks for this user
    await runAsync(`DELETE FROM agent_decisions WHERE task_id IN (SELECT id FROM agent_tasks WHERE user_id = ?)`, [id]);
    await runAsync(`DELETE FROM react_traces WHERE task_id IN (SELECT id FROM agent_tasks WHERE user_id = ?)`, [id]);
    await runAsync(`DELETE FROM agent_execution_summary WHERE task_id IN (SELECT id FROM agent_tasks WHERE user_id = ?)`, [id]);
    await runAsync('DELETE FROM agent_tasks WHERE user_id = ?', [id]);
    
    // Delete user
    await runAsync('DELETE FROM users WHERE id = ?', [id]);
    
    // Send email
    if (user.email && user.username) {
        sendAccountDeletionEmail(user.email, user.username).catch(e => console.error('Failed to send deletion email', e));
    }
    
    res.json({ message: 'User removed successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * PUT /owner/bookings/:id/cancel
 * Cancel a user's ticket/booking
 */
router.put('/bookings/:id/cancel', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  try {
    const booking = await getAsync('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.booking_status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled' });
    }

    // Set status to cancelled
    await runAsync('UPDATE bookings SET booking_status = ? WHERE id = ?', ['cancelled', id]);

    // Restore available seats in schedules
    const seatsToRestore = booking.seat_numbers.split(',').length;
    await runAsync(
      'UPDATE schedules SET available_seats = available_seats + ? WHERE id = ?',
      [seatsToRestore, booking.schedule_id]
    );

    // Look up the user's email from users table and send admin cancellation email
    const userRow = await getAsync('SELECT email, username FROM users WHERE id = ?', [booking.user_id]);
    if (userRow && userRow.email) {
      sendAdminCancellationEmail(userRow.email, {
        pnr: booking.pnr,
        busName: booking.bus_name,
        busNumber: booking.bus_number,
        travelDate: booking.travel_date
      }).catch(e => console.error('Failed to send admin cancel email', e));
    }

    res.json({ message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Failed to cancel booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

/**
 * GET /owner/companies
 * Get all companies with counts of their buses and bookings
 */
router.get('/companies', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();

  db.all(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'companies'
  `, (schemaErr, columns) => {
    if (schemaErr) {
      console.error('Error reading companies schema:', schemaErr);
      return res.status(500).json({ error: 'Failed to fetch companies' });
    }

    const columnNames = columns.map((column) => column.name);
    const nameSelect = columnNames.includes('company_name') ? 'COALESCE(c.company_name, c.name)' : 'c.name';
    const emailSelect = columnNames.includes('company_email') ? 'COALESCE(c.company_email, c.email)' : 'c.email';
    const statusSelect = columnNames.includes('status')
      ? 'c.status'
      : "CASE WHEN c.is_active = 1 THEN 'ACTIVE' ELSE 'SUSPENDED' END AS status";
    const statusClause = columnNames.includes('status')
      ? "COALESCE(c.status, CASE WHEN c.is_active = 1 THEN 'ACTIVE' ELSE 'SUSPENDED' END) = 'ACTIVE'"
      : 'c.is_active = 1';

    db.all(
      `SELECT 
        c.id, 
        ${nameSelect} as name, 
        ${emailSelect} as email, 
        ${statusSelect},
        c.is_active, 
        c.created_at,
        COUNT(DISTINCT b.id) as total_buses,
        (
          SELECT COUNT(bk.id) 
          FROM bookings bk 
          JOIN schedules s ON bk.schedule_id = s.id 
          JOIN buses bus ON s.bus_id = bus.id 
          WHERE bus.company_id = c.id
        ) as total_bookings,
        COALESCE(
          (
            SELECT SUM(bk.total_price) 
            FROM bookings bk 
            JOIN schedules s ON bk.schedule_id = s.id 
            JOIN buses bus ON s.bus_id = bus.id 
            WHERE bus.company_id = c.id AND bk.booking_status = 'confirmed'
          ), 
          0
        ) as total_revenue
       FROM companies c
       LEFT JOIN buses b ON c.id = b.company_id
      WHERE ${statusClause}
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      (err, companies) => {
        if (err) {
          console.error('Error fetching companies:', err);
          return res.status(500).json({ error: 'Failed to fetch companies' });
        }
        res.json(companies);
      }
    );
  });
});

/**
 * POST /owner/companies
 * Add a new company account
 */
router.post('/companies', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      `INSERT INTO companies (
        name,
        email,
        password,
        company_name,
        password_hash,
        status,
        is_active
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 1)`,
      [name.trim(), email.toLowerCase().trim(), hashedPassword, name.trim(), hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ error: 'Company name or email already exists' });
          }
          console.error('Add company error:', err);
          return res.status(500).json({ error: 'Failed to create company account' });
        }
        
        res.status(201).json({ 
          message: 'Company account created successfully',
          companyId: this.lastID
        });
      }
    );
  } catch (error) {
    console.error('Add company error:', error);
    res.status(500).json({ error: 'Failed to create company account' });
  }
});

/**
 * GET /owner/company-requests
 * List company registration requests
 */
router.get('/company-requests', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();

  db.all(
    `SELECT
      id,
      company_name,
      company_email,
      phone,
      address,
      fleet_size,
      company_description,
      gst_license_number,
      bus_types,
      status,
      created_at
     FROM company_requests
     ORDER BY created_at DESC`,
    (err, requests) => {

      if (err) {
        console.error('Error fetching company requests:', err);
        return res.status(500).json({ error: 'Failed to fetch company requests' });
      }

      res.json(requests);
    }
  );
});

/**
 * POST /owner/company-requests/:id/approve
 * Approve a company request and activate the company account
 */
router.post('/company-requests/:id/approve', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  db.get('SELECT * FROM company_requests WHERE id = ?', [id], (err, request) => {
    if (err) {
      console.error('Approve request lookup error:', err);
      return res.status(500).json({ error: 'Failed to approve company request' });
    }

    if (!request) {
      return res.status(404).json({ error: 'Company request not found' });
    }

    if (request.status === 'APPROVED') {
      return res.status(409).json({ error: 'This company request has already been approved' });
    }

    if (request.status === 'REJECTED') {
      return res.status(409).json({ error: 'This company request has already been rejected' });
    }

    db.all(`
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'companies'
    `, (schemaErr, columns) => {
      if (schemaErr) {
        console.error('Approve request companies schema error:', schemaErr);
        return res.status(500).json({ error: 'Failed to approve company request' });
      }

      const columnNames = columns.map((column) => column.name);
      const insertColumns = [];
      const insertValues = [];

      if (columnNames.includes('name')) {
        insertColumns.push('name');
        insertValues.push(request.company_name);
      }

      if (columnNames.includes('email')) {
        insertColumns.push('email');
        insertValues.push(request.company_email);
      }

      if (columnNames.includes('password')) {
        insertColumns.push('password');
        insertValues.push(request.password_hash);
      }

      if (columnNames.includes('company_name')) {
        insertColumns.push('company_name');
        insertValues.push(request.company_name);
      }

      if (columnNames.includes('company_email')) {
        insertColumns.push('company_email');
        insertValues.push(request.company_email);
      }

      if (columnNames.includes('password_hash')) {
        insertColumns.push('password_hash');
        insertValues.push(request.password_hash);
      }

      if (columnNames.includes('status')) {
        insertColumns.push('status');
        insertValues.push('ACTIVE');
      }

      if (columnNames.includes('is_active')) {
        insertColumns.push('is_active');
        insertValues.push(1);
      }

      const placeholders = insertColumns.map(() => '?').join(', ');
      const conflictTarget = columnNames.includes('email') ? 'email' : 'id';
      const updateAssignments = [];

      if (columnNames.includes('name')) updateAssignments.push('name = excluded.name');
      if (columnNames.includes('email')) updateAssignments.push('email = excluded.email');
      if (columnNames.includes('password')) updateAssignments.push('password = excluded.password');
      if (columnNames.includes('company_name')) updateAssignments.push('company_name = excluded.company_name');
      if (columnNames.includes('company_email')) updateAssignments.push('company_email = excluded.company_email');
      if (columnNames.includes('password_hash')) updateAssignments.push('password_hash = excluded.password_hash');
      if (columnNames.includes('status')) updateAssignments.push("status = 'ACTIVE'");
      if (columnNames.includes('is_active')) updateAssignments.push('is_active = 1');

      const upsertSuffix = updateAssignments.length
        ? `ON CONFLICT(${conflictTarget}) DO UPDATE SET ${updateAssignments.join(', ')}`
        : '';

      db.run(
        `INSERT INTO companies (${insertColumns.join(', ')}) VALUES (${placeholders}) ${upsertSuffix}`,
        insertValues,
        function insertErr(insertError) {
          if (insertError) {
            console.error('Approve request insert error:', insertError);
            return res.status(500).json({ error: 'Failed to approve company request' });
          }

          db.run(
            `UPDATE company_requests SET status = 'APPROVED' WHERE id = ?`,
            [id],
            function updateErr(updateError) {
              if (updateError) {
                console.error('Approve request status update error:', updateError);
                return res.status(500).json({ error: 'Failed to approve company request' });
              }

              res.json({ message: 'Company approved successfully.' });
            }
          );
        }
      );
    });
  });
});

/**
 * POST /owner/company-requests/:id/reject
 * Reject a company request
 */
router.post('/company-requests/:id/reject', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  db.get('SELECT id FROM company_requests WHERE id = ?', [id], (err, request) => {
    if (err) {
      console.error('Reject request lookup error:', err);
      return res.status(500).json({ error: 'Failed to reject company request' });
    }

    if (!request) {
      return res.status(404).json({ error: 'Company request not found' });
    }

    db.run(
      `UPDATE company_requests SET status = 'REJECTED' WHERE id = ?`,
      [id],
      function updateErr(updateError) {
        if (updateError) {
          console.error('Reject request status update error:', updateError);
          return res.status(500).json({ error: 'Failed to reject company request' });
        }

        res.json({ message: 'Company registration rejected.' });
      }
    );
  });
});

/**
 * PATCH /owner/companies/:id/status
 * Toggle company account block status
 */
router.patch('/companies/:id/status', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const { is_active } = req.body;
  
  if (is_active === undefined || (is_active !== 0 && is_active !== 1)) {
    return res.status(400).json({ error: 'is_active must be 0 or 1' });
  }
  
  db.run(
    'UPDATE companies SET is_active = ? WHERE id = ?',
    [is_active, id],
    function(err) {
      if (err) {
        console.error('Update company status error:', err);
        return res.status(500).json({ error: 'Failed to update company account status' });
      }
      
      res.json({ message: `Company account ${is_active === 1 ? 'activated' : 'blocked'} successfully` });
    }
  );
});

/**
 * DELETE /owner/companies/:id
 * Delete a company account (and all its buses, schedules, bookings, reviews, locks)
 */
router.delete('/companies/:id', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    const company = await getAsync('SELECT * FROM companies WHERE id = ?', [id]);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const buses = await allAsync('SELECT id FROM buses WHERE company_id = ?', [id]);
    const busIds = buses.map(b => b.id);

    if (busIds.length > 0) {
      const busPlaceholders = busIds.map(() => '?').join(',');
      const schedules = await allAsync(`SELECT id FROM schedules WHERE bus_id IN (${busPlaceholders})`, busIds);
      const scheduleIds = schedules.map(s => s.id);

      if (scheduleIds.length > 0) {
        const schedulePlaceholders = scheduleIds.map(() => '?').join(',');
        await runAsync(`DELETE FROM bookings WHERE schedule_id IN (${schedulePlaceholders})`, scheduleIds);
        await runAsync(`DELETE FROM group_bookings WHERE schedule_id IN (${schedulePlaceholders})`, scheduleIds);
        await runAsync(`DELETE FROM seat_locks WHERE schedule_id IN (${schedulePlaceholders})`, scheduleIds);
      }

      await runAsync(`DELETE FROM seat_reviews WHERE bus_id IN (${busPlaceholders})`, busIds);
      await runAsync(`DELETE FROM seats WHERE bus_id IN (${busPlaceholders})`, busIds);
      await runAsync(`DELETE FROM schedules WHERE bus_id IN (${busPlaceholders})`, busIds);
      await runAsync(`DELETE FROM buses WHERE company_id = ?`, [id]);
    }

    if (company.email) {
      await runAsync(`DELETE FROM company_requests WHERE LOWER(company_email) = LOWER(?)`, [company.email]);
    }

    await runAsync('DELETE FROM companies WHERE id = ?', [id]);

    res.json({ message: 'Company account and all associated buses, schedules, and bookings deleted successfully' });
  } catch (err) {
    console.error('Error deleting company:', err);
    res.status(500).json({ error: 'Failed to delete company account and dependencies' });
  }
});

/**
 * GET /owner/policies
 * Get all cancellation policies
 */
router.get('/policies', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  db.all('SELECT * FROM cancellation_rules ORDER BY hours_before_departure DESC', (err, rules) => {
    if (err) {
      console.error('Error fetching policies:', err);
      return res.status(500).json({ error: 'Failed to fetch cancellation policies' });
    }
    res.json(rules);
  });
});

/**
 * POST /owner/policies
 * Create or update a cancellation policy rule
 */
router.post('/policies', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { hours_before_departure, refund_percentage, description } = req.body;

  if (hours_before_departure === undefined || refund_percentage === undefined || !description) {
    return res.status(400).json({ error: 'All policy fields are required' });
  }

  db.get('SELECT id FROM cancellation_rules WHERE hours_before_departure = ?', [hours_before_departure], (err, existingRule) => {
    if (err) {
      console.error('Policy check error:', err);
      return res.status(500).json({ error: 'Failed to save policy' });
    }

    if (existingRule) {
      db.run(
        'UPDATE cancellation_rules SET refund_percentage = ?, description = ? WHERE hours_before_departure = ?',
        [refund_percentage, description.trim(), hours_before_departure],
        function(err) {
          if (err) {
            console.error('Update policy error:', err);
            return res.status(500).json({ error: 'Failed to update policy' });
          }
          res.json({ message: 'Policy updated successfully' });
        }
      );
    } else {
      db.run(
        'INSERT INTO cancellation_rules (hours_before_departure, refund_percentage, description) VALUES (?, ?, ?)',
        [hours_before_departure, refund_percentage, description.trim()],
        function(err) {
          if (err) {
            console.error('Add policy error:', err);
            return res.status(500).json({ error: 'Failed to create policy' });
          }
          res.status(201).json({ message: 'Policy created successfully', policyId: this.lastID });
        }
      );
    }
  });
});

/**
 * DELETE /owner/policies/:id
 * Delete a cancellation policy rule
 */
router.delete('/policies/:id', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.run('DELETE FROM cancellation_rules WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Delete policy error:', err);
      return res.status(500).json({ error: 'Failed to delete policy' });
    }
    res.json({ message: 'Policy deleted successfully' });
  });
});

/**
 * GET /owner/places
 * Fetch all registered places
 */
router.get('/places', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  // Instant cleanup safety check
  db.run("DELETE FROM places WHERE LOWER(name) LIKE '%ananta%'", () => {
    db.all(`
      SELECT * FROM places 
      WHERE LOWER(name) NOT IN (SELECT LOWER(name) FROM deleted_places)
        AND LOWER(name) NOT LIKE '%ananta%'
      ORDER BY name ASC
    `, (err, places) => {
      if (err) {
        console.error('Error fetching places:', err);
        return res.status(500).json({ error: 'Failed to fetch places' });
      }
      res.json(places || []);
    });
  });
});

/**
 * POST /owner/places
 * Add a new place / city
 */
router.post('/places', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { name, state, code, image_url, landmarks } = req.body;

  if (!name || !state) {
    return res.status(400).json({ error: 'Name and State are required' });
  }

  const cleanName = name.trim();
  const cleanState = state.trim();
  const cleanCode = (code || cleanName.substring(0, 3).toUpperCase()).trim();
  const cleanImg = image_url?.trim() || 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=600&q=80';
  const cleanLandmarks = landmarks?.trim() || '';

  db.run(
    'INSERT INTO places (name, state, code, image_url, landmarks, is_active) VALUES (?, ?, ?, ?, ?, 1)',
    [cleanName, cleanState, cleanCode, cleanImg, cleanLandmarks],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE') || err.message.includes('duplicate')) {
          return res.status(409).json({ error: 'A place with this name already exists' });
        }
        console.error('Error adding place:', err);
        return res.status(500).json({ error: 'Failed to add place' });
      }

      res.status(201).json({
        message: 'Place added successfully',
        place: {
          id: this.lastID,
          name: cleanName,
          state: cleanState,
          code: cleanCode,
          image_url: cleanImg,
          landmarks: cleanLandmarks,
          is_active: 1
        }
      });
    }
  );
});

/**
 * PUT /owner/places/:id
 * Update an existing place
 */
router.put('/places/:id', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const { name, state, code, image_url, landmarks } = req.body;

  if (!name || !state) {
    return res.status(400).json({ error: 'Name and State are required' });
  }

  db.run(
    'UPDATE places SET name = ?, state = ?, code = ?, image_url = ?, landmarks = ? WHERE id = ?',
    [name.trim(), state.trim(), code?.trim(), image_url?.trim(), landmarks?.trim(), id],
    function (err) {
      if (err) {
        console.error('Error updating place:', err);
        return res.status(500).json({ error: 'Failed to update place' });
      }
      res.json({ message: 'Place updated successfully' });
    }
  );
});

/**
 * PATCH /owner/places/:id/status
 * Toggle place active status
 */
router.patch('/places/:id/status', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const { is_active } = req.body;

  db.run('UPDATE places SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id], function (err) {
    if (err) {
      console.error('Error updating place status:', err);
      return res.status(500).json({ error: 'Failed to update place status' });
    }
    res.json({ message: 'Place status updated successfully' });
  });
});

/**
 * DELETE /owner/places/:id
 * Delete a place
 */
router.delete('/places/:id', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  db.get('SELECT name FROM places WHERE id = ?', [id], (err, place) => {
    if (err || !place) return res.status(404).json({ error: 'Place not found' });

    db.get(
      'SELECT id FROM routes WHERE LOWER(from_city) = LOWER(?) OR LOWER(to_city) = LOWER(?)',
      [place.name, place.name],
      (routeErr, route) => {
        if (route) {
          return res.status(400).json({
            error: `Cannot delete place "${place.name}" because it is currently used in active bus routes.`
          });
        }

        db.run('DELETE FROM places WHERE id = ?', [id], function (delErr) {
          if (delErr) {
            console.error('Error deleting place:', delErr);
            return res.status(500).json({ error: 'Failed to delete place' });
          }
          res.json({ message: 'Place deleted successfully' });
        });
      }
    );
  });
});

/**
 * GET /owner/schedules
 * Fetch all bus schedules across companies
 */
router.get('/schedules', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const sql = `
    SELECT 
      s.*,
      b.bus_name,
      b.bus_number,
      b.bus_type,
      COALESCE(c.company_name, c.name, b.operator) as company_name,
      r.from_city,
      r.to_city,
      r.distance_km,
      r.duration_hours
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    LEFT JOIN companies c ON b.company_id = c.id
    JOIN routes r ON s.route_id = r.id
    ORDER BY s.travel_date DESC, s.departure_time ASC
  `;

  db.all(sql, [], (err, schedules) => {
    if (err) {
      console.error('Error fetching owner schedules:', err);
      return res.status(500).json({ error: 'Failed to fetch schedules' });
    }
    res.json(schedules || []);
  });
});

/**
 * POST /owner/schedules
 * Create a schedule for any bus
 */
router.post('/schedules', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { route_id, bus_id, departure_time, arrival_time, base_price, dates, is_daily_service } = req.body;

  if (!route_id || !bus_id || !departure_time || !arrival_time || !base_price || !dates || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({ error: 'Missing required schedule fields or empty dates array' });
  }

  db.get('SELECT total_seats FROM buses WHERE id = ?', [bus_id], (err, bus) => {
    if (err || !bus) {
      return res.status(404).json({ error: 'Bus not found' });
    }

    const availableSeats = bus.total_seats || 40;
    const isDaily = is_daily_service ? 1 : 0;
    const stmt = db.prepare(`
      INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, base_price, available_seats, travel_date, is_daily_service)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.serialize(() => {
      dates.forEach((dateStr) => {
        stmt.run(route_id, bus_id, departure_time, arrival_time, base_price, availableSeats, dateStr, isDaily);
      });

      stmt.finalize((finalErr) => {
        if (finalErr) {
          console.error('Error inserting owner schedules:', finalErr);
          return res.status(500).json({ error: 'Failed to create schedule(s)' });
        }
        res.status(201).json({ message: `Successfully created schedule(s) for ${dates.length} date(s)` });
      });
    });
  });
});

/**
 * DELETE /owner/schedules/:id
 * Delete a schedule and notify passengers
 */
router.delete('/schedules/:id', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    // Fetch affected bookings before deletion to send cancellation emails
    const affectedBookings = await allAsync(`
      SELECT b.pnr, b.seat_numbers, b.total_price, b.passenger_name,
             u.email, s.travel_date, s.departure_time,
             bus.bus_name, r.from_city, r.to_city
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN schedules s ON b.schedule_id = s.id
      JOIN buses bus ON s.bus_id = bus.id
      JOIN routes r ON s.route_id = r.id
      WHERE b.schedule_id = ? AND b.booking_status = 'confirmed'
    `, [id]);

    if (affectedBookings && affectedBookings.length > 0) {
      affectedBookings.forEach(booking => {
        sendServiceCancellationEmail({
          email: booking.email,
          passenger_name: booking.passenger_name,
          pnr: booking.pnr,
          seat_numbers: booking.seat_numbers,
          total_price: booking.total_price,
          travel_date: booking.travel_date,
          departure_time: booking.departure_time,
          from_city: booking.from_city,
          to_city: booking.to_city,
          bus_name: booking.bus_name
        }).catch(emailErr => console.error('Failed to send service cancellation email:', emailErr));
      });
    }

    // Sequential deletes
    await runAsync('DELETE FROM bookings WHERE schedule_id = ?', [id]);
    await runAsync('DELETE FROM seat_locks WHERE schedule_id = ?', [id]);
    await runAsync('DELETE FROM group_bookings WHERE schedule_id = ?', [id]);
    await runAsync('DELETE FROM schedules WHERE id = ?', [id]);

    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

/**
 * GET /owner/routes
 * Fetch all registered routes (deduplicated by city pairs)
 */
router.get('/routes', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  db.all('SELECT * FROM routes ORDER BY from_city ASC, to_city ASC', [], (err, routes) => {
    if (err) {
      console.error('Error fetching owner routes:', err);
      return res.status(500).json({ error: 'Failed to fetch routes' });
    }

    const uniqueMap = new Map();
    (routes || []).forEach(r => {
      if (!r.from_city || !r.to_city) return;
      const key = `${r.from_city.trim().toLowerCase()}->${r.to_city.trim().toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, r);
      }
    });

    res.json(Array.from(uniqueMap.values()));
  });
});

/**
 * POST /owner/routes
 * Add a new route between two cities
 */
router.post('/routes', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { from_city, to_city, distance_km, duration_hours } = req.body;

  if (!from_city || !to_city || !distance_km || !duration_hours) {
    return res.status(400).json({ error: 'from_city, to_city, distance_km, and duration_hours are required' });
  }

  if (from_city.trim().toLowerCase() === to_city.trim().toLowerCase()) {
    return res.status(400).json({ error: 'Origin and destination cities cannot be the same' });
  }

  db.run(
    'INSERT INTO routes (from_city, to_city, distance_km, duration_hours) VALUES (?, ?, ?, ?)',
    [from_city.trim(), to_city.trim(), Number(distance_km), Number(duration_hours)],
    function (err) {
      if (err) {
        console.error('Error adding route:', err);
        return res.status(500).json({ error: 'Failed to create route' });
      }
      res.status(201).json({
        message: 'Route created successfully',
        routeId: this.lastID
      });
    }
  );
});

/**
 * DELETE /owner/routes/:id
 * Delete a route
 */
router.delete('/routes/:id', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  try {
    const sched = await getAsync('SELECT id FROM schedules WHERE route_id = ?', [id]);
    if (sched) {
      return res.status(400).json({ error: 'Cannot delete route because there are active bus schedules using this route.' });
    }

    await runAsync('DELETE FROM stopped_route_services WHERE route_id = ?', [id]);
    await runAsync('DELETE FROM routes WHERE id = ?', [id]);

    res.json({ message: 'Route deleted successfully' });
  } catch (error) {
    console.error('Error deleting route:', error);
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

/**
 * GET /owner/places
 * Fetch all registered places
 */
router.get('/places', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  db.all(`
    SELECT * FROM places 
    WHERE LOWER(name) NOT IN (SELECT LOWER(name) FROM deleted_places)
      AND LOWER(name) NOT LIKE '%ananta%'
    ORDER BY name ASC
  `, [], (err, places) => {
    if (err) {
      console.error('Error fetching owner places:', err);
      return res.status(500).json({ error: 'Failed to fetch places' });
    }
    res.json(places || []);
  });
});

/**
 * POST /owner/places
 * Add a new place / city
 */
router.post('/places', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { name, state, code, image_url, landmarks } = req.body;

  if (!name || !state) {
    return res.status(400).json({ error: 'City name and state are required' });
  }

  const placeName = name.trim();
  const placeState = state.trim();
  const placeCode = code ? code.trim().toUpperCase() : placeName.substring(0, 3).toUpperCase();
  const placeImage = image_url ? image_url.trim() : null;
  const placeLandmarks = landmarks ? landmarks.trim() : null;

  db.run('DELETE FROM deleted_places WHERE LOWER(name) = LOWER(?)', [placeName], () => {
    db.run(
      `INSERT INTO places (name, state, code, image_url, landmarks, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(name) DO UPDATE SET
         state = EXCLUDED.state,
         code = EXCLUDED.code,
         image_url = COALESCE(EXCLUDED.image_url, places.image_url),
         landmarks = COALESCE(EXCLUDED.landmarks, places.landmarks),
         is_active = 1`,
      [placeName, placeState, placeCode, placeImage, placeLandmarks],
      function (err) {
        if (err) {
          console.error('Error adding place:', err);
          return res.status(500).json({ error: 'Failed to add place: ' + err.message });
        }
        res.status(201).json({
          message: 'Place added successfully',
          id: this.lastID
        });
      }
    );
  });
});

/**
 * PATCH /owner/places/:id/status
 * Toggle place active status
 */
router.patch('/places/:id/status', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const { is_active } = req.body;

  db.run(
    'UPDATE places SET is_active = ? WHERE id = ?',
    [is_active ? 1 : 0, id],
    function (err) {
      if (err) {
        console.error('Error updating place status:', err);
        return res.status(500).json({ error: 'Failed to update place status' });
      }
      res.json({ message: 'Place status updated successfully' });
    }
  );
});

/**
 * DELETE /owner/places/:id
 * Delete a place permanently and purge all dependencies from platform
 */
router.delete('/places/:id', authenticateToken, requireOwner, async (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const runAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  const getAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  const allAsync = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    const place = await getAsync('SELECT name FROM places WHERE id = ?', [id]);
    if (!place) {
      return res.status(404).json({ error: 'Place not found' });
    }

    const cityName = place.name.trim();

    // 1. Find all routes that match this place name (case-insensitive)
    const routes = await allAsync('SELECT id FROM routes WHERE LOWER(from_city) = LOWER(?) OR LOWER(to_city) = LOWER(?)', [cityName, cityName]);
    const routeIds = routes.map(r => r.id);

    if (routeIds.length > 0) {
      // 2. Find all schedules for these routes
      const routePlaceholders = routeIds.map(() => '?').join(',');
      const schedules = await allAsync(`SELECT id FROM schedules WHERE route_id IN (${routePlaceholders})`, routeIds);
      const scheduleIds = schedules.map(s => s.id);

      if (scheduleIds.length > 0) {
        const schedulePlaceholders = scheduleIds.map(() => '?').join(',');
        // 3. Delete dependent bookings, group_bookings, and seat_locks
        await runAsync(`DELETE FROM bookings WHERE schedule_id IN (${schedulePlaceholders})`, scheduleIds);
        await runAsync(`DELETE FROM group_bookings WHERE schedule_id IN (${schedulePlaceholders})`, scheduleIds);
        await runAsync(`DELETE FROM seat_locks WHERE schedule_id IN (${schedulePlaceholders})`, scheduleIds);
        // 4. Delete schedules
        await runAsync(`DELETE FROM schedules WHERE route_id IN (${routePlaceholders})`, routeIds);
      }

      // 5. Delete routes
      await runAsync(`DELETE FROM routes WHERE LOWER(from_city) = LOWER(?) OR LOWER(to_city) = LOWER(?)`, [cityName, cityName]);
    }

    // 6. Delete route_requests referencing this place
    await runAsync('DELETE FROM route_requests WHERE source_place_id = ? OR destination_place_id = ?', [id, id]);

    // 7. Delete place requests referencing this place name
    await runAsync('DELETE FROM place_requests WHERE LOWER(place_name) = LOWER(?)', [cityName]);

    // 8. Record tombstone
    await runAsync('INSERT INTO deleted_places (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [cityName]);

    // 9. Delete place
    await runAsync('DELETE FROM places WHERE id = ?', [id]);

    res.json({ message: `Place "${cityName}" and all associated routes, schedules, and bookings deleted successfully` });
  } catch (error) {
    console.error('Failed to delete place:', error);
    res.status(500).json({ error: 'Failed to delete place' });
  }
});

/**
 * GET /owner/place-requests
 * Fetch all place requests for Owner review
 */
router.get('/place-requests', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();

  const sql = `
    SELECT 
      pr.id,
      pr.bus_owner_id,
      pr.place_name,
      pr.normalized_name,
      pr.district,
      pr.state,
      pr.bus_station,
      pr.reason,
      pr.status,
      pr.rejection_reason,
      pr.created_at,
      COALESCE(c.name, u.username, u.email, 'Bus Owner #' || pr.bus_owner_id) as company_name,
      COALESCE(c.email, u.email, '') as company_email
    FROM place_requests pr
    LEFT JOIN users u ON pr.bus_owner_id = u.id
    LEFT JOIN companies c ON (pr.bus_owner_id = c.id OR LOWER(c.email) = LOWER(u.email))
    ORDER BY pr.id DESC
  `;

  db.all(sql, (err, requests) => {
    if (err) {
      console.error('❌ Error fetching place requests:', err.message);
      return db.all('SELECT * FROM place_requests ORDER BY id DESC', (fallbackErr, rows) => {
        if (fallbackErr) {
          console.error('❌ Fallback place_requests query error:', fallbackErr.message);
          return res.status(500).json({ error: 'Failed to fetch place requests' });
        }
        res.json(rows || []);
      });
    }
    console.log(`✅ [GET /owner/place-requests] Successfully fetched ${requests ? requests.length : 0} place request(s)`);
    res.json(requests || []);
  });
});

/**
 * PATCH /owner/place-requests/:id/approve
 * Approve a place request and activate it in central places table
 */
router.patch('/place-requests/:id/approve', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const ownerId = req.user.id;

  db.get('SELECT * FROM place_requests WHERE id = ?', [id], (err, pReq) => {
    if (err || !pReq) {
      return res.status(404).json({ error: 'Place request not found' });
    }

    if (pReq.status === 'approved') {
      return res.status(400).json({ error: 'This place request has already been approved.' });
    }

    const placeName = pReq.place_name.trim();
    const placeState = pReq.state.trim();
    const placeCode = placeName.substring(0, 3).toUpperCase();
    const landmarks = pReq.bus_station ? `Bus Station: ${pReq.bus_station}` : null;

    // 1. Remove from tombstone if previously deleted
    db.run('DELETE FROM deleted_places WHERE LOWER(name) = LOWER(?)', [placeName], () => {
      // 2. Insert/activate in central places table
      db.run(
        `INSERT INTO places (name, state, code, landmarks, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (name) DO UPDATE SET is_active = 1, state = EXCLUDED.state`,
        [placeName, placeState, placeCode, landmarks],
        function (pErr) {
          if (pErr) {
            console.error('Error creating place from approval:', pErr);
            return res.status(500).json({ error: 'Failed to approve place' });
          }

          // 3. Mark request as approved
          db.run(
            `UPDATE place_requests 
             SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? 
             WHERE id = ?`,
            [ownerId, id],
            (uErr) => {
              if (uErr) {
                console.error('Error updating place request status:', uErr);
              }
              res.json({
                message: `Place "${placeName}" approved and added to active cities!`,
                placeName
              });
            }
          );
        }
      );
    });
  });
});

/**
 * PATCH /owner/place-requests/:id/reject
 * Reject a place request
 */
router.patch('/place-requests/:id/reject', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const ownerId = req.user.id;
  const { rejection_reason } = req.body;

  db.run(
    `UPDATE place_requests
     SET status = 'rejected', rejection_reason = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
     WHERE id = ?`,
    [rejection_reason ? rejection_reason.trim() : 'Request rejected by platform owner', ownerId, id],
    function (err) {
      if (err) {
        console.error('Error rejecting place request:', err);
        return res.status(500).json({ error: 'Failed to reject place request' });
      }
      res.json({ message: 'Place request rejected.' });
    }
  );
});

/**
 * GET /owner/route-requests
 * Fetch all route requests for Owner review
 */
router.get('/route-requests', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const sql = `
    SELECT 
      rr.*,
      COALESCE(sp.name, rr.from_city, 'Place #' || COALESCE(rr.source_place_id, 0)) as source_name,
      COALESCE(sp.state, 'Andhra Pradesh') as source_state,
      COALESCE(dp.name, rr.to_city, 'Place #' || COALESCE(rr.destination_place_id, 0)) as destination_name,
      COALESCE(dp.state, 'Andhra Pradesh') as destination_state,
      COALESCE(c.name, 'Bus Owner #' || COALESCE(rr.bus_owner_id, rr.company_id, 0)) as company_name,
      COALESCE(c.email, '') as company_email
    FROM route_requests rr
    LEFT JOIN places sp ON rr.source_place_id = sp.id
    LEFT JOIN places dp ON rr.destination_place_id = dp.id
    LEFT JOIN companies c ON (rr.bus_owner_id = c.id OR rr.company_id = c.id)
    ORDER BY CASE WHEN rr.status = 'pending' THEN 0 ELSE 1 END, rr.created_at DESC
  `;

  db.all(sql, [], (err, requests) => {
    if (err) {
      console.error('Error fetching route requests:', err);
      return res.status(500).json({ error: 'Failed to fetch route requests' });
    }
    res.json(requests || []);
  });
});

/**
 * PATCH /owner/route-requests/:id/approve
 * Approve a route request and activate it in central routes table
 */
router.patch('/route-requests/:id/approve', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const ownerId = req.user.id;

  const sql = `
    SELECT 
      rr.*,
      COALESCE(sp.name, rr.from_city, 'City #' || COALESCE(rr.source_place_id, 0)) as source_name,
      COALESCE(dp.name, rr.to_city, 'City #' || COALESCE(rr.destination_place_id, 0)) as destination_name
    FROM route_requests rr
    LEFT JOIN places sp ON rr.source_place_id = sp.id
    LEFT JOIN places dp ON rr.destination_place_id = dp.id
    WHERE rr.id = ?
  `;

  db.get(sql, [id], (err, rReq) => {
    if (err || !rReq) {
      return res.status(404).json({ error: 'Route request not found' });
    }

    if (rReq.status === 'approved') {
      return res.status(400).json({ error: 'This route request has already been approved.' });
    }

    const fromCity = rReq.source_name.trim();
    const toCity = rReq.destination_name.trim();
    const defaultDistance = Number(rReq.distance_km) || 320;
    const defaultDuration = Number(rReq.duration_hours) || 6.0;

    db.serialize(() => {
      // 1. Insert route into central routes table
      db.run(
        `INSERT INTO routes (from_city, to_city, distance_km, duration_hours)
         VALUES (?, ?, ?, ?)`,
        [fromCity, toCity, defaultDistance, defaultDuration],
        function (rErr) {
          if (rErr && !rErr.message.includes('UNIQUE')) {
            console.error('Error creating route from approval:', rErr);
          }

          // 2. Update route request status to approved
          db.run(
            `UPDATE route_requests SET status = 'approved' WHERE id = ?`,
            [id],
            function (uErr) {
              if (uErr) {
                console.error('Error updating route request status:', uErr);
                return res.status(500).json({ error: 'Failed to update route request status: ' + (uErr.message || '') });
              }

              // Safely set reviewed_at and reviewed_by if available
              db.run(
                `UPDATE route_requests SET reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?`,
                [ownerId, id],
                () => {}
              );

              res.json({
                message: `Route "${fromCity} → ${toCity}" approved successfully and added to platform routes.`,
                route: `${fromCity} → ${toCity}`
              });
            }
          );
        }
      );
    });
  });
});

/**
 * PATCH /owner/route-requests/:id/reject
 * Reject a route request
 */
router.patch('/route-requests/:id/reject', authenticateToken, requireOwner, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const ownerId = req.user.id;
  const { rejection_reason } = req.body;

  db.run(
    `UPDATE route_requests SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
    [rejection_reason ? rejection_reason.trim() : 'Request rejected by platform owner', id],
    function (err) {
      if (err) {
        console.error('Error rejecting route request:', err);
        return res.status(500).json({ error: 'Failed to reject route request: ' + (err.message || '') });
      }

      db.run(
        `UPDATE route_requests SET reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?`,
        [ownerId, id],
        () => {}
      );

      res.json({ message: 'Route request rejected.' });
    }
  );
});

module.exports = router;
