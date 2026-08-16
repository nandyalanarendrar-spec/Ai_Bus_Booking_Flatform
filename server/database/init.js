const { createDatabase } = require('./postgres');

let db;
let cleanupInterval = null;

function initializeDatabase() {
  db = createDatabase();
  db.ready
    .then(() => {
      console.log('ðŸ“¦ Creating database schema...');
      createTables();
    })
    .catch((err) => {
      console.error('Database connection error:', err);
    });
  
  return db;
}

async function createTables() {
  const runAsync = (sql, params = []) => new Promise((resolve) => {
    db.run(sql, params, function(err) {
      if (err && !err.message.includes('already exists') && !err.message.includes('duplicate column')) {
        // Log minor SQL notices without halting execution
      }
      resolve(this);
    });
  });

  try {
    // 1. Users & Profiles
    await runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        verified INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS user_otps (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        preferred_seat_type TEXT,
        preferred_bus_type TEXT,
        budget_preference TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 2. Routes, Buses & Services
    await runAsync(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        from_city TEXT NOT NULL,
        to_city TEXT NOT NULL,
        distance_km INTEGER NOT NULL,
        duration_hours REAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS buses (
        id SERIAL PRIMARY KEY,
        bus_number TEXT UNIQUE NOT NULL,
        bus_name TEXT NOT NULL,
        bus_type TEXT NOT NULL,
        has_ac INTEGER DEFAULT 0,
        is_sleeper INTEGER DEFAULT 0,
        is_daily_service INTEGER DEFAULT 1,
        total_seats INTEGER DEFAULT 40,
        operator TEXT NOT NULL,
        rating REAL DEFAULT 4.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync("ALTER TABLE buses ADD COLUMN IF NOT EXISTS is_daily_service INTEGER DEFAULT 1");

    await runAsync(`
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        route_id INTEGER NOT NULL,
        bus_id INTEGER NOT NULL,
        departure_time TEXT NOT NULL,
        arrival_time TEXT NOT NULL,
        base_price REAL NOT NULL,
        available_seats INTEGER NOT NULL,
        travel_date DATE NOT NULL,
        is_daily_service INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
        FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE CASCADE
      )
    `);

    await runAsync("ALTER TABLE schedules ADD COLUMN IF NOT EXISTS is_daily_service INTEGER DEFAULT 0");

    await runAsync(`
      CREATE TABLE IF NOT EXISTS stopped_route_services (
        id SERIAL PRIMARY KEY,
        bus_id INTEGER NOT NULL,
        route_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bus_id, route_id)
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS seats (
        id SERIAL PRIMARY KEY,
        bus_id INTEGER NOT NULL,
        seat_number TEXT NOT NULL,
        seat_type TEXT NOT NULL,
        deck TEXT DEFAULT 'lower',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE CASCADE,
        UNIQUE(bus_id, seat_number)
      )
    `);

    // 3. Bookings & Seat Locks
    await runAsync(`
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        schedule_id INTEGER NOT NULL,
        booking_group_id TEXT,
        seat_numbers TEXT NOT NULL,
        passenger_name TEXT NOT NULL,
        passenger_age INTEGER,
        passenger_gender TEXT,
        total_price REAL NOT NULL,
        booking_status TEXT DEFAULT 'confirmed',
        pnr TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS seat_locks (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL,
        seat_number TEXT NOT NULL,
        locked_by_user INTEGER NOT NULL,
        session_id TEXT,
        locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
        FOREIGN KEY (locked_by_user) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await runAsync("ALTER TABLE seat_locks ADD COLUMN IF NOT EXISTS session_id TEXT");
    await runAsync("CREATE UNIQUE INDEX IF NOT EXISTS idx_seat_locks_schedule_seat ON seat_locks(schedule_id, seat_number)");

    // 4. Auxiliary & Agent Tables
    await runAsync(`
      CREATE TABLE IF NOT EXISTS cancellation_rules (
        id SERIAL PRIMARY KEY,
        hours_before_departure INTEGER NOT NULL,
        refund_percentage INTEGER NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        task_type TEXT NOT NULL,
        input_data TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        result TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS agent_decisions (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        confidence REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS react_traces (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        step_type TEXT NOT NULL CHECK(step_type IN ('thought', 'action', 'observation')),
        content TEXT NOT NULL,
        metadata TEXT,
        duration_ms INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS agent_execution_summary (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        execution_plan TEXT NOT NULL,
        agents_invoked TEXT NOT NULL,
        total_react_steps INTEGER DEFAULT 0,
        total_duration_ms INTEGER DEFAULT 0,
        final_status TEXT DEFAULT 'pending',
        final_output TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS admin_whitelist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS admin_otps (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS seat_reviews (
        id SERIAL PRIMARY KEY,
        bus_id INTEGER NOT NULL,
        seat_number TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        booking_id INTEGER,
        rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS deleted_places (
        name TEXT PRIMARY KEY,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS group_bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        schedule_id INTEGER NOT NULL,
        group_size INTEGER NOT NULL,
        seat_numbers TEXT NOT NULL,
        booking_ids TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        current_intent TEXT,
        selected_route TEXT,
        selected_bus TEXT,
        selected_seat TEXT,
        booking_stage TEXT,
        last_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await runAsync("CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_sessions_user_id ON conversation_sessions(user_id)");

    // 5. Companies, Owners & Places
    await runAsync(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS company_requests (
        id SERIAL PRIMARY KEY,
        company_name TEXT,
        company_email TEXT UNIQUE,
        password_hash TEXT,
        phone TEXT,
        address TEXT,
        fleet_size INTEGER,
        company_description TEXT,
        gst_license_number TEXT,
        bus_types TEXT,
        status TEXT DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS owners (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS places (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        code TEXT,
        image_url TEXT,
        landmarks TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS place_requests (
        id SERIAL PRIMARY KEY,
        bus_owner_id INTEGER NOT NULL,
        place_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        district TEXT,
        state TEXT NOT NULL,
        bus_station TEXT,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS route_requests (
        id SERIAL PRIMARY KEY,
        bus_owner_id INTEGER NOT NULL,
        source_place_id INTEGER NOT NULL,
        destination_place_id INTEGER NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER,
        FOREIGN KEY (source_place_id) REFERENCES places(id),
        FOREIGN KEY (destination_place_id) REFERENCES places(id)
      )
    `);

    console.log('✅ Database tables created successfully');
    db.run(`
      INSERT INTO places (name, state, code, is_active)
      VALUES 
        ('Kadapa', 'Andhra Pradesh', 'CDP', 1)
      ON CONFLICT (name) DO NOTHING
    `);
    runMigrations();
    deleteAnantapurAndRoutes(() => {
      seedPlaces();
      syncRouteCitiesToPlacesTable();
    });
  } catch (err) {
    console.error('Error creating database tables:', err);
  }
}

function fixForeignKeyCascades(done) {
  const cascades = [
    `ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_user_id_fkey`,
    `ALTER TABLE agent_tasks ADD CONSTRAINT agent_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,

    `ALTER TABLE agent_decisions DROP CONSTRAINT IF EXISTS agent_decisions_task_id_fkey`,
    `ALTER TABLE agent_decisions ADD CONSTRAINT agent_decisions_task_id_fkey FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE`,

    `ALTER TABLE react_traces DROP CONSTRAINT IF EXISTS react_traces_task_id_fkey`,
    `ALTER TABLE react_traces ADD CONSTRAINT react_traces_task_id_fkey FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE`,

    `ALTER TABLE agent_execution_summary DROP CONSTRAINT IF EXISTS agent_execution_summary_task_id_fkey`,
    `ALTER TABLE agent_execution_summary ADD CONSTRAINT agent_execution_summary_task_id_fkey FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE`,

    `ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_user_id_fkey`,
    `ALTER TABLE bookings ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,

    `ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey`,
    `ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,

    `ALTER TABLE conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_user_id_fkey`,
    `ALTER TABLE conversation_sessions ADD CONSTRAINT conversation_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,

    `ALTER TABLE seat_reviews DROP CONSTRAINT IF EXISTS seat_reviews_user_id_fkey`,
    `ALTER TABLE seat_reviews ADD CONSTRAINT seat_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,

    `ALTER TABLE group_bookings DROP CONSTRAINT IF EXISTS group_bookings_user_id_fkey`,
    `ALTER TABLE group_bookings ADD CONSTRAINT group_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,

    `ALTER TABLE seat_locks DROP CONSTRAINT IF EXISTS seat_locks_locked_by_user_fkey`,
    `ALTER TABLE seat_locks ADD CONSTRAINT seat_locks_locked_by_user_fkey FOREIGN KEY (locked_by_user) REFERENCES users(id) ON DELETE CASCADE`
  ];

  let count = 0;
  cascades.forEach(sql => {
    db.run(sql, [], () => {
      count++;
      if (count === cascades.length) {
        console.log('✅ Foreign key ON DELETE CASCADE constraints updated.');
        if (typeof done === 'function') done();
      }
    });
  });
}

function runMigrations() {
  console.log('🔄 Running database migrations...');
  fixForeignKeyCascades();
  
  // Migration: Add booking_group_id to bookings table if it doesn't exist
  db.all(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'bookings'
  `, (err, columns) => {
    if (err) {
      console.error('Migration error:', err);
      runBusesMigration();
      return;
    }
    
    const hasBookingGroupId = columns.some(col => col.name === 'booking_group_id');
    
    if (!hasBookingGroupId) {
      console.log('  âž• Adding booking_group_id column to bookings table...');
      db.run('ALTER TABLE bookings ADD COLUMN booking_group_id TEXT', (err) => {
        if (err) {
          console.error('  âŒ Failed to add booking_group_id column:', err);
        } else {
          console.log('  âœ… booking_group_id column added successfully');
        }
        runBusesMigration();
      });
    } else {
      runBusesMigration();
    }
  });
}

function runBusesMigration() {
  db.all(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'buses'
  `, (err, columns) => {
    if (err) {
      console.error('Migration error on buses:', err);
      runCompanyMigrations();
      return;
    }
    
    const hasCompanyId = columns.some(col => col.name === 'company_id');
    
    if (!hasCompanyId) {
      console.log('  âž• Adding company_id column to buses table...');
      db.run('ALTER TABLE buses ADD COLUMN company_id INTEGER', (err) => {
        if (err) {
          console.error('  âŒ Failed to add company_id column:', err);
        } else {
          console.log('  âœ… company_id column added successfully');
        }
        runCompanyMigrations();
      });
    } else {
      runCompanyMigrations();
    }
  });
}

function runCompanyMigrations() {
  db.all(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'companies'
  `, (err, columns) => {
    if (err) {
      console.error('Migration error on companies:', err);
      runCompanyRequestsMigrations();
      return;
    }

    const columnNames = columns.map((column) => column.name);
    const migrations = [];

    if (!columnNames.includes('company_name')) {
      migrations.push((next) => db.run('ALTER TABLE companies ADD COLUMN company_name TEXT', next));
    }

    if (!columnNames.includes('password_hash')) {
      migrations.push((next) => db.run('ALTER TABLE companies ADD COLUMN password_hash TEXT', next));
    }

    if (!columnNames.includes('status')) {
      migrations.push((next) => db.run("ALTER TABLE companies ADD COLUMN status TEXT DEFAULT 'ACTIVE'", next));
    }

    const runNext = (index) => {
      if (index >= migrations.length) {
        db.run(`
          UPDATE companies
          SET
            company_name = COALESCE(company_name, name),
            password_hash = COALESCE(password_hash, password),
            status = COALESCE(status, CASE WHEN is_active = 1 THEN 'ACTIVE' ELSE 'SUSPENDED' END)
        `, () => {
          runCompanyRequestsMigrations();
        });
        return;
      }

      migrations[index]((migrationErr) => {
        if (migrationErr) {
          console.error('Migration error on companies schema:', migrationErr);
        }
        runNext(index + 1);
      });
    };

    runNext(0);
  });
}

function runCompanyRequestsMigrations() {
  db.all(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'company_requests'
  `, (err, columns) => {
    if (err) {
      console.error('Migration error on company_requests:', err);
      seedData();
      return;
    }

    const columnNames = columns.map((column) => column.name);
    const migrations = [];

    if (!columnNames.includes('company_name')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN company_name TEXT', next));
    }

    if (!columnNames.includes('company_email')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN company_email TEXT', next));
    }

    if (!columnNames.includes('password_hash')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN password_hash TEXT', next));
    }

    if (!columnNames.includes('phone')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN phone TEXT', next));
    }

    if (!columnNames.includes('address')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN address TEXT', next));
    }

    if (!columnNames.includes('fleet_size')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN fleet_size INTEGER', next));
    }

    if (!columnNames.includes('company_description')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN company_description TEXT', next));
    }

    if (!columnNames.includes('gst_license_number')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN gst_license_number TEXT', next));
    }

    if (!columnNames.includes('bus_types')) {
      migrations.push((next) => db.run('ALTER TABLE company_requests ADD COLUMN bus_types TEXT', next));
    }

    if (!columnNames.includes('status')) {
      migrations.push((next) => db.run("ALTER TABLE company_requests ADD COLUMN status TEXT DEFAULT 'PENDING'", next));
    }

    const runNext = (index) => {
      if (index >= migrations.length) {
        db.run(`
          UPDATE company_requests
          SET
            company_name = COALESCE(company_name, name),
            company_email = COALESCE(company_email, email),
            password_hash = COALESCE(password_hash, password),
            status = COALESCE(status, 'PENDING')
        `, () => {
          runPlaceAndRouteRequestsMigrations(() => {
            ensureOwnerSeeded(() => seedData());
          });
        });

        return;
      }

      migrations[index]((migrationErr) => {
        if (migrationErr) {
          console.error('Migration error on company_requests schema:', migrationErr);
        }
        runNext(index + 1);
      });
    };

    runNext(0);
  });
}

function runPlaceAndRouteRequestsMigrations(done) {
  db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS bus_owner_id INTEGER", () => {
    db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS company_id INTEGER", () => {
      db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS source_place_id INTEGER", () => {
        db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS destination_place_id INTEGER", () => {
          db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS from_city TEXT", () => {
            db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS to_city TEXT", () => {
              db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS distance_km REAL DEFAULT 150", () => {
                db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS duration_hours REAL DEFAULT 3.0", () => {
                  db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT", () => {
                    db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP", () => {
                      db.run("ALTER TABLE route_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER", () => {
                        db.run("ALTER TABLE route_requests ALTER COLUMN company_id DROP NOT NULL", () => {
                          db.run("ALTER TABLE route_requests ALTER COLUMN bus_owner_id DROP NOT NULL", () => {
                            db.run("ALTER TABLE route_requests ALTER COLUMN from_city DROP NOT NULL", () => {
                              db.run("ALTER TABLE route_requests ALTER COLUMN to_city DROP NOT NULL", () => {
                                db.run("ALTER TABLE route_requests ALTER COLUMN source_place_id DROP NOT NULL", () => {
                                  db.run("ALTER TABLE route_requests ALTER COLUMN destination_place_id DROP NOT NULL", () => {
                                    db.run("ALTER TABLE route_requests ALTER COLUMN distance_km DROP NOT NULL", () => {
                                      db.run("ALTER TABLE route_requests ALTER COLUMN duration_hours DROP NOT NULL", () => {
                                        if (done) done();
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

function ensureOwnerSeeded(done) {
  // Call done() immediately so startup is NOT blocked by seeding
  if (done) done();

  // Run seeding async in background — does NOT block the server or DB pool
  setImmediate(async () => {
    const bcrypt = require('bcryptjs');

    try {
      // Use cost=8 (10x faster than cost=10, still secure for internal seeding)
      const COST = 8;

      // 1. Platform Owner — only hash+write if password needs updating
      const existingOwner = await new Promise(resolve =>
        db.get('SELECT id, password FROM owners WHERE LOWER(email) = ?', ['nandyalanarendrar@gmail.com'], (e, r) => resolve(r))
      );
      const ownerHash = await bcrypt.hash('n@rendra-16', COST);
      if (!existingOwner) {
        await new Promise(resolve => db.run(
          'INSERT INTO owners (email, password, name, is_active) VALUES (?, ?, ?, 1)',
          ['nandyalanarendrar@gmail.com', ownerHash, 'Platform Owner'], resolve
        ));
      } else {
        await new Promise(resolve => db.run(
          'UPDATE owners SET password = ?, is_active = 1 WHERE LOWER(email) = ?',
          [ownerHash, 'nandyalanarendrar@gmail.com'], resolve
        ));
      }
      console.log('✅ Platform Owner (nandyalanarendrar@gmail.com) login ready!');

      // 2. Customer User
      const userHash = await bcrypt.hash('123456', COST);
      await new Promise(resolve => db.run(
        'INSERT INTO users (username, email, password, verified) VALUES (?, ?, ?, 1) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, verified = 1',
        ['narendra', 'narendra@example.com', userHash], resolve
      ));
      console.log('✅ Customer User (narendra) login ready!');

      // 3. Bus Owner Companies (parallel for speed)
      const companies = [
        { name: 'VRL Travels',    email: 'vrl@travels.com',    pass: 'vrl123' },
        { name: 'RedBus Fleet',   email: 'redbus@fleet.com',   pass: 'redfleet123' },
        { name: 'Kaveri Travels', email: 'kaveri@travels.com', pass: 'kaveri123' },
        { name: 'Orange Travels', email: 'orange@travels.com', pass: 'orange123' }
      ];

      await Promise.all(companies.map(async comp => {
        const h = await bcrypt.hash(comp.pass, COST);
        await new Promise(resolve => db.run(
          `INSERT INTO companies (name, email, password, password_hash, company_name, is_active, status)
           VALUES (?, ?, ?, ?, ?, 1, 'ACTIVE')
           ON CONFLICT (email) DO UPDATE SET
             password = EXCLUDED.password,
             password_hash = EXCLUDED.password_hash,
             is_active = 1, status = 'ACTIVE'`,
          [comp.name, comp.email, h, h, comp.name], resolve
        ));
      }));
      console.log('✅ Bus Owner Companies (Orange, VRL, Kaveri, RedBus) logins ready!');

    } catch (err) {
      console.error('Background seed error (non-fatal):', err.message);
    }
  });
}


function ensureAllCitiesSeededInPlacesTable(callback) {
  // Only seed default cities if places table is completely empty!
  db.get('SELECT COUNT(*) as count FROM places', (err, row) => {
    if (err || (row && parseInt(row.count) > 0)) {
      console.log('✅ Central places verified (preserving all owner place deletions & disabled status).');
      cleanupDuplicateRoutes(callback);
      return;
    }

    console.log('➕ Seeding initial default places into empty database...');
    const defaultCities = [
      { name: 'Hyderabad', state: 'Telangana', code: 'HYD' },
      { name: 'Bangalore', state: 'Karnataka', code: 'BLR' },
      { name: 'Vijayawada', state: 'Andhra Pradesh', code: 'BZA' },
      { name: 'Chennai', state: 'Tamil Nadu', code: 'MAA' },
      { name: 'Mumbai', state: 'Maharashtra', code: 'BOM' },
      { name: 'Pune', state: 'Maharashtra', code: 'PNQ' },
      { name: 'Goa', state: 'Goa', code: 'GOI' },
      { name: 'Delhi', state: 'Delhi NCR', code: 'DEL' },
      { name: 'Jaipur', state: 'Rajasthan', code: 'JAI' },
      { name: 'Tirupati', state: 'Andhra Pradesh', code: 'TPT' },
      { name: 'Visakhapatnam', state: 'Andhra Pradesh', code: 'VTZ' },
      { name: 'Kochi', state: 'Kerala', code: 'COK' },
      { name: 'Kadapa', state: 'Andhra Pradesh', code: 'CDP' },
      { name: 'Anantapur', state: 'Andhra Pradesh', code: 'ATP' },
      { name: 'Ananthapuram', state: 'Andhra Pradesh', code: 'ATP' },
      { name: 'Kurnool', state: 'Andhra Pradesh', code: 'KRN' },
      { name: 'Bhimavaram', state: 'Andhra Pradesh', code: 'BVR' },
      { name: 'Amalapuram', state: 'Andhra Pradesh', code: 'AMP' }
    ];

    let insertedCount = 0;
    defaultCities.forEach(c => {
      db.run(
        'INSERT INTO places (name, state, code, is_active) VALUES (?, ?, ?, 1)',
        [c.name, c.state, c.code],
        () => {
          insertedCount++;
          if (insertedCount === defaultCities.length) {
            console.log('✅ Initial default places seeded successfully.');
            cleanupDuplicateRoutes(callback);
          }
        }
      );
    });
  });
}

function cleanupDuplicateRoutes(callback) {
  db.all('SELECT * FROM routes ORDER BY id ASC', (err, rows) => {
    if (err || !rows || rows.length === 0) {
      if (typeof callback === 'function') callback();
      return;
    }

    const seenKeys = new Map();
    const duplicateIdsToDelete = [];

    rows.forEach(r => {
      if (!r.from_city || !r.to_city) return;
      const key = `${r.from_city.trim().toLowerCase()}->${r.to_city.trim().toLowerCase()}`;
      if (seenKeys.has(key)) {
        duplicateIdsToDelete.push(r.id);
      } else {
        seenKeys.set(key, r.id);
      }
    });

    if (duplicateIdsToDelete.length === 0) {
      console.log('✅ No duplicate routes found in database.');
      if (typeof callback === 'function') callback();
      return;
    }

    console.log(`🧹 Cleaning up ${duplicateIdsToDelete.length} duplicate route entries from database...`);

    const deleteNext = (idx) => {
      if (idx >= duplicateIdsToDelete.length) {
        console.log('✅ Duplicate routes successfully purged from database.');
        if (typeof callback === 'function') callback();
        return;
      }

      const dupId = duplicateIdsToDelete[idx];
      db.run('DELETE FROM routes WHERE id = ?', [dupId], (dErr) => {
        if (dErr) console.error(`Error deleting duplicate route #${dupId}:`, dErr);
        deleteNext(idx + 1);
      });
    };

    deleteNext(0);
  });
}

function ensureKadapaAnantapurRoutesSeeded(callback) {
  ensureAllCitiesSeededInPlacesTable(() => {
    db.get("SELECT COUNT(*) as count FROM routes WHERE LOWER(from_city) = 'kadapa'", (err, row) => {
      const doNext = () => ensureKadapaAnantapurSchedulesSeeded(callback);

      if (err || (row && parseInt(row.count) > 0)) {
        doNext();
        return;
      }

    console.log('📌 Migrating Kadapa routes into existing database...');
    const newRoutes = [
      ['Kadapa', 'Hyderabad', 410, 7.5],
      ['Hyderabad', 'Kadapa', 410, 7.5],
      ['Kadapa', 'Tirupati', 140, 3.0],
      ['Tirupati', 'Kadapa', 140, 3.0],
      ['Kadapa', 'Bangalore', 250, 5.0],
      ['Bangalore', 'Kadapa', 250, 5.0],
      ['Kadapa', 'Vijayawada', 370, 7.0],
      ['Vijayawada', 'Kadapa', 370, 7.0]
    ];

    db.serialize(() => {
      const stmt = db.prepare('INSERT INTO routes (from_city, to_city, distance_km, duration_hours) VALUES (?, ?, ?, ?)');
      newRoutes.forEach(r => stmt.run(r[0], r[1], r[2], r[3]));
      stmt.finalize(() => {
        console.log('✅ Kadapa & Anantapur routes inserted successfully.');
        doNext();
      });
    });
  });
});
}

function ensureKadapaAnantapurSchedulesSeeded(callback) {
  db.get(
    `SELECT COUNT(*) as count 
     FROM schedules s 
     JOIN routes r ON s.route_id = r.id 
     WHERE LOWER(r.from_city) IN ('kadapa', 'anantapur', 'ananthapuram')`,
    (err, row) => {
      if (!err && row && parseInt(row.count) > 0) {
        if (typeof callback === 'function') callback();
        return;
      }

      console.log('📌 Generating 30 days of rolling schedules for Kadapa & Anantapur / Ananthapuram routes...');
      db.all(
        `SELECT id, from_city, to_city, distance_km, duration_hours FROM routes 
         WHERE LOWER(from_city) IN ('kadapa', 'anantapur', 'ananthapuram') 
            OR LOWER(to_city) IN ('kadapa', 'anantapur', 'ananthapuram')`,
        (rErr, targetRoutes) => {
          if (rErr || !targetRoutes || targetRoutes.length === 0) {
            if (typeof callback === 'function') callback();
            return;
          }

          db.all('SELECT id, total_seats FROM buses LIMIT 10', (bErr, buses) => {
            if (bErr || !buses || buses.length === 0) {
              if (typeof callback === 'function') callback();
              return;
            }

            const today = new Date();
            const dates = [];
            for (let d = 0; d < 30; d++) {
              const date = new Date(today);
              date.setDate(today.getDate() + d);
              dates.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
            }

            const times = [
              ['06:00', '09:00'],
              ['10:30', '13:30'],
              ['16:00', '19:00'],
              ['21:30', '00:30']
            ];

            const stmt = db.prepare(`
              INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, base_price, available_seats, travel_date, is_daily_service)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `);

            db.serialize(() => {
              let count = 0;
              targetRoutes.forEach((route, rIdx) => {
                const bus = buses[rIdx % buses.length];
                const basePrice = Math.round(route.distance_km * 2.2);
                dates.forEach((dateStr) => {
                  times.forEach((t) => {
                    stmt.run(route.id, bus.id, t[0], t[1], basePrice, bus.total_seats || 40, dateStr, 1);
                    count++;
                  });
                });
              });

              stmt.finalize((finalErr) => {
                if (finalErr) console.error('Error populating Kadapa schedules:', finalErr);
                else console.log(`✅ Successfully seeded ${count} active schedules for Kadapa & Anantapur / Ananthapuram!`);
                if (typeof callback === 'function') callback();
              });
            });
          });
        }
      );
    }
  );
}

async function deleteAnantapurAndRoutes(callback) {
  try {
    const targetCities = ['anantapur', 'ananthapuram', 'ananthapur', 'anantapuram'];

    // 1. Insert tombstones in deleted_places
    for (const city of targetCities) {
      await new Promise(res => db.run('INSERT INTO deleted_places (name) VALUES (?) ON CONFLICT (name) DO NOTHING', [city], () => res()));
    }

    // 2. Delete seat locks
    await new Promise(res => db.run(`
      DELETE FROM seat_locks 
      WHERE schedule_id IN (
        SELECT s.id FROM schedules s 
        JOIN routes r ON s.route_id = r.id 
        WHERE LOWER(r.from_city) LIKE '%ananta%' OR LOWER(r.to_city) LIKE '%ananta%'
      )
    `, [], () => res()));

    // 3. Delete bookings
    await new Promise(res => db.run(`
      DELETE FROM bookings 
      WHERE schedule_id IN (
        SELECT s.id FROM schedules s 
        JOIN routes r ON s.route_id = r.id 
        WHERE LOWER(r.from_city) LIKE '%ananta%' OR LOWER(r.to_city) LIKE '%ananta%'
      )
    `, [], () => res()));

    // 4. Delete schedules
    await new Promise(res => db.run(`
      DELETE FROM schedules 
      WHERE route_id IN (
        SELECT r.id FROM routes r 
        WHERE LOWER(r.from_city) LIKE '%ananta%' OR LOWER(r.to_city) LIKE '%ananta%'
      )
    `, [], () => res()));

    // 5. Delete routes
    await new Promise(res => db.run(`
      DELETE FROM routes 
      WHERE LOWER(from_city) LIKE '%ananta%' OR LOWER(to_city) LIKE '%ananta%'
    `, [], () => res()));

    // 6. Delete places
    await new Promise(res => db.run(`
      DELETE FROM places 
      WHERE LOWER(name) LIKE '%ananta%'
    `, [], () => res()));

    console.log('✅ Anantapur / Ananthapuram city, routes, schedules, and places successfully purged from Neon PostgreSQL!');
  } catch (err) {
    console.error('Error purging Anantapur:', err);
  } finally {
    if (typeof callback === 'function') callback();
  }
}

function seedData() {
  db.get('SELECT COUNT(*) as count FROM routes', (err, row) => {
    if (err || (row && row.count > 0)) {
      if (!err) {
        console.log('✅ Database already seeded');
        applyDataVariationMigrations(() => {
          ensureCompaniesAndBusesMigrated(() => {
            ensureKadapaAnantapurRoutesSeeded(() => {
              deleteAnantapurAndRoutes(() => {
                syncRouteCitiesToPlacesTable(() => {
                  db.all('SELECT from_city, to_city, distance_km, duration_hours FROM routes', (err, routes) => {
                    if (!err && routes) {
                      const routesData = routes.map(r => [r.from_city, r.to_city, r.distance_km, r.duration_hours]);
                      
                      startScheduleCleanupService(routesData);
                      console.log('🔄 Running cleanup check on server restart...');
                      setTimeout(() => performDailyCleanup(routesData), 100);
                    }
                  });
                });
              });
            });
          });
        });
      }
      return;
    }
    
    console.log('ðŸŒ± Seeding database...');
    
    db.serialize(() => {
      // Seed routes (complete network: every city to every other city)
      const cities = ['Hyderabad', 'Vijayawada', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi', 'Jaipur', 'Tirupati', 'Kadapa', 'Anantapur', 'Visakhapatnam', 'Kochi'];
      const distances = {
        'Hyderabad-Vijayawada': [275, 5.5],
        'Hyderabad-Bangalore': [575, 10],
        'Hyderabad-Chennai': [630, 11],
        'Hyderabad-Mumbai': [710, 13],
        'Hyderabad-Pune': [560, 10],
        'Hyderabad-Delhi': [1580, 26],
        'Hyderabad-Jaipur': [1450, 24],
        'Hyderabad-Tirupati': [555, 9.5],
        'Hyderabad-Kadapa': [410, 7.5],
        'Hyderabad-Anantapur': [360, 6.5],
        'Hyderabad-Visakhapatnam': [620, 11.5],
        'Vijayawada-Bangalore': [650, 11],
        'Vijayawada-Chennai': [430, 7.5],
        'Vijayawada-Mumbai': [920, 16],
        'Vijayawada-Pune': [770, 13.5],
        'Vijayawada-Delhi': [1700, 28],
        'Vijayawada-Jaipur': [1570, 26],
        'Vijayawada-Tirupati': [320, 6],
        'Vijayawada-Kadapa': [370, 7.0],
        'Vijayawada-Anantapur': [480, 8.5],
        'Vijayawada-Visakhapatnam': [350, 6.0],
        'Bangalore-Chennai': [350, 6.5],
        'Bangalore-Mumbai': [985, 17],
        'Bangalore-Pune': [835, 14.5],
        'Bangalore-Delhi': [2150, 35],
        'Bangalore-Jaipur': [2020, 33],
        'Bangalore-Tirupati': [255, 5],
        'Bangalore-Kadapa': [250, 5.0],
        'Bangalore-Anantapur': [215, 4.0],
        'Chennai-Mumbai': [1335, 22],
        'Chennai-Pune': [1185, 20],
        'Chennai-Delhi': [2180, 36],
        'Chennai-Jaipur': [2050, 34],
        'Chennai-Tirupati': [135, 2.5],
        'Chennai-Kadapa': [260, 5.0],
        'Mumbai-Pune': [150, 3.5],
        'Mumbai-Delhi': [1420, 24],
        'Mumbai-Jaipur': [1160, 20],
        'Mumbai-Tirupati': [1100, 18],
        'Pune-Delhi': [1470, 24.5],
        'Pune-Jaipur': [1210, 21],
        'Pune-Tirupati': [950, 16],
        'Delhi-Jaipur': [280, 5.5],
        'Delhi-Tirupati': [2050, 34],
        'Jaipur-Tirupati': [1920, 32],
        'Kadapa-Anantapur': [145, 3.0],
        'Kadapa-Tirupati': [140, 3.0],
        'Anantapur-Tirupati': [280, 5.5]
      };
      
      const routesData = [];
      for (let i = 0; i < cities.length; i++) {
        for (let j = 0; j < cities.length; j++) {
          if (i !== j) {
            const from = cities[i];
            const to = cities[j];
            const key1 = `${from}-${to}`;
            const key2 = `${to}-${from}`;
            const distData = distances[key1] || distances[key2];
            if (distData) {
              routesData.push([from, to, distData[0], distData[1]]);
            }
          }
        }
      }
      
      const routeStmt = db.prepare('INSERT INTO routes (from_city, to_city, distance_km, duration_hours) VALUES (?, ?, ?, ?)');
      routesData.forEach(route => routeStmt.run(...route));
      routeStmt.finalize();
      
      // Seed buses (25 buses for comprehensive coverage)
      const busesData = [
        ['AP29TX1234', 'VRL Travels Express', 'Volvo', 1, 0, 40, 'VRL Travels', 4.5],
        ['TS07AB5678', 'Orange Sleeper', 'Sleeper', 1, 1, 40, 'Orange Travels', 4.3],
        ['KA01CD9012', 'SRS Non-AC', 'Ordinary', 0, 0, 40, 'SRS Travels', 4.0],
        ['TN22EF3456', 'RedBus Deluxe', 'Volvo', 1, 0, 40, 'RedBus', 4.7],
        ['MH12GH7890', 'Neeta Volvo', 'Volvo', 1, 1, 40, 'Neeta Travels', 4.6],
        ['DL08IJ2345', 'RSRTC Express', 'Semi-Sleeper', 1, 0, 40, 'RSRTC', 4.2],
        ['AP30MN6789', 'IntrCity SmartBus', 'Volvo', 1, 0, 40, 'IntrCity', 4.4],
        ['TS08PQ1111', 'Kaveri Travels', 'Sleeper', 1, 1, 40, 'Kaveri', 4.3],
        ['KA02RS2222', 'Greenline Express', 'Volvo', 1, 0, 40, 'Greenline', 4.6],
        ['TN23UV3333', 'KPN Travels', 'Semi-Sleeper', 1, 0, 40, 'KPN Travels', 4.5],
        ['MH13WX4444', 'Purple Mobility', 'Volvo', 1, 1, 40, 'Purple', 4.7],
        ['DL09YZ5555', 'VE Travels', 'Sleeper', 1, 1, 40, 'VE Travels', 4.4],
        ['AP31AB6666', 'SRS Volvo AC', 'Volvo', 1, 0, 40, 'SRS Travels', 4.5],
        ['TS09CD7777', 'Jabbar Travels', 'Sleeper', 1, 1, 40, 'Jabbar', 4.2],
        ['KA03EF8888', 'Sharma Transport', 'Semi-Sleeper', 1, 0, 40, 'Sharma', 4.1],
        ['TN24GH9999', 'Parveen Travels', 'Volvo', 1, 0, 40, 'Parveen', 4.6],
        ['MH14IJ1111', 'Shrinath Travels', 'Volvo', 1, 1, 40, 'Shrinath', 4.5],
        ['DL10KL2222', 'Rajasthan Roadways', 'Semi-Sleeper', 1, 0, 40, 'RSRTC', 4.3],
        ['AP32MN3333', 'Garuda Express', 'Sleeper', 1, 1, 40, 'Garuda', 4.4],
        ['TS10NO4444', 'Dolphin Travels', 'Volvo', 1, 0, 40, 'Dolphin', 4.6],
        ['KA04PQ5555', 'Airavat Club Class', 'Volvo', 1, 1, 40, 'KSRTC', 4.7],
        ['TN25RS6666', 'Setc Volvo', 'Volvo', 1, 0, 40, 'SETC', 4.5],
        ['MH15TU7777', 'Shivneri Sleeper', 'Sleeper', 1, 1, 40, 'MSRTC', 4.4],
        ['DL11VW8888', 'UPSRTC Volvo', 'Volvo', 1, 0, 40, 'UPSRTC', 4.3],
        ['AP33XY9999', 'Vijay Luxury', 'Volvo', 1, 1, 40, 'Vijay Travels', 4.8]
      ];
      
      const busStmt = db.prepare('INSERT INTO buses (bus_number, bus_name, bus_type, has_ac, is_sleeper, total_seats, operator, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      busesData.forEach(bus => busStmt.run(...bus));
      busStmt.finalize();
      
      // Seed seats for each bus (40 seats per bus)
      const seatStmt = db.prepare('INSERT INTO seats (bus_id, seat_number, seat_type, deck) VALUES (?, ?, ?, ?)');
      for (let busId = 1; busId <= 25; busId++) {
        for (let seatNum = 1; seatNum <= 40; seatNum++) {
          // 2+2 bus layout: [Window][Aisle] | [Aisle][Window]
          // Positions 1,4 in each group of 4 = Window; positions 2,3 = Aisle
          const posInGroup = ((seatNum - 1) % 4) + 1;
          const seatType = (posInGroup === 1 || posInGroup === 4) ? 'window' : 'aisle';
          const deck = seatNum <= 30 ? 'lower' : 'upper';
          seatStmt.run(busId, `S${seatNum}`, seatType, deck);
        }
      }
      seatStmt.finalize();
      
      // Generate initial 30 days of schedules (wait for completion)
      generateSchedulesForDateRange(routesData, 0, 30).then(() => {
        // Seed cancellation rules
        const cancellationData = [
          [48, 90, 'Full refund minus â‚¹50 service charge'],
          [24, 75, '75% refund'],
          [12, 50, '50% refund'],
          [6, 25, '25% refund'],
          [0, 0, 'No refund']
        ];
        
        const cancelStmt = db.prepare('INSERT INTO cancellation_rules (hours_before_departure, refund_percentage, description) VALUES (?, ?, ?)');
        cancellationData.forEach(rule => cancelStmt.run(...rule));
        cancelStmt.finalize(() => {
          // Seed admin whitelist with a default admin
          const adminData = [
            ['admin@busapp.com', 'System Administrator']
          ];
          
          const adminStmt = db.prepare('INSERT INTO admin_whitelist (email, name) VALUES (?, ?)');
          adminData.forEach(admin => adminStmt.run(...admin));
          adminStmt.finalize(() => {
            // Seed owner with hashed password
            const bcrypt = require('bcryptjs');
            const ownerEmail = 'nandyalanarendrar@gmail.com';
            const ownerPassword = 'n@rendra-16';
            const ownerName = 'System Owner';
            
            bcrypt.hash(ownerPassword, 10, (err, hashedPassword) => {
              if (err) {
                console.error('âŒ Error hashing owner password:', err);
                return;
              }
              
              db.run(
                'INSERT INTO owners (email, password, name) VALUES (?, ?, ?)',
                [ownerEmail, hashedPassword, ownerName],
                function(err) {
                  if (err) {
                    console.error('âŒ Error seeding owner:', err);
                  } else {
                    console.log('âœ… Database owner seeded successfully');
                    
                    ensureCompaniesAndBusesMigrated(() => {
                      console.log('âœ… Database seeded successfully');
                      console.log(`   - ${routesData.length} routes (complete network: all cities connected)`);
                      console.log('   - 25 buses');
                      console.log('   - 1000 seats (40 per bus)');
                      console.log(`   - ${routesData.length * 4 * 30} schedules for 30 days`);
                      console.log('   - 5 cancellation rules');
                      console.log('   - 1 admin user (admin@busapp.com)');
                      console.log('   - 1 owner user (nandyalanarendrar@gmail.com)');
                      console.log('');
                      
                      // Start the automatic cleanup service AFTER seeding is complete
                      startScheduleCleanupService(routesData);
                    });
                  }
                }
              );
            });
          });
        });
      }).catch(err => {
        console.error('âŒ Error seeding schedules:', err);
      });
    });
  });
}

// Helper functions for schedule generation
function calculatePrice(distKm) {
  return Math.round(distKm * 2.5);
}

function addMinutesToTime(time, minutesToAdd) {
  const [hours, mins] = time.split(':').map(Number);
  const total = ((hours * 60) + mins + minutesToAdd) % (24 * 60);
  const normalized = total < 0 ? total + (24 * 60) : total;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getStaggeredDepartureTime(routeId, slotIndex) {
  const baseDepartureTimes = ['06:00', '14:00', '18:30', '22:00'];
  const baseTime = baseDepartureTimes[slotIndex] || baseDepartureTimes[0];
  const routeOffset = ((routeId - 1) % 12) * 30;
  return addMinutesToTime(baseTime, routeOffset);
}

function calculateDynamicPrice(distKm, busId, slotIndex, routeId, dayOffset = 0) {
  // Deterministic fare variation by route, slot, and bus so same route has distinct options.
  let price = distKm * 2.2;
  price += (busId * 23) % 150;
  price += slotIndex * 75;
  price += (routeId * 31) % 200;

  const weekday = dayOffset % 7;
  if (weekday === 5 || weekday === 6) {
    price *= 1.04;
  }

  return Math.max(250, Math.round(price / 10) * 10);
}

function getDayOffsetFromToday(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function calcArrival(depTime, durationHours) {
  const [hours, mins] = depTime.split(':').map(Number);
  let arrHours = (hours + Math.floor(durationHours)) % 24;
  let arrMins = mins + Math.round((durationHours % 1) * 60);
  if (arrMins >= 60) {
    arrHours = (arrHours + 1) % 24;
    arrMins -= 60;
  }
  return `${String(arrHours).padStart(2, '0')}:${String(arrMins).padStart(2, '0')}`;
}

// Generate schedules for a specific date range
function generateSchedulesForDateRange(routesData, startDayOffset, endDayOffset) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, from_city, to_city, distance_km, duration_hours FROM routes ORDER BY id', (routesErr, dbRoutes) => {
      if (routesErr || !dbRoutes || dbRoutes.length === 0) {
        return reject(routesErr || new Error('No routes found in database for schedule generation'));
      }

      db.all('SELECT id FROM buses ORDER BY id', (busesErr, dbBuses) => {
        const busIds = (!busesErr && dbBuses && dbBuses.length > 0)
          ? dbBuses.map(b => b.id)
          : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

        const scheduleStmt = db.prepare('INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, base_price, available_seats, travel_date) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const today = new Date();
        let scheduleCount = 0;

        for (let day = startDayOffset; day < endDayOffset; day++) {
          const travelDate = new Date(today);
          travelDate.setDate(today.getDate() + day);
          const dateStr = `${travelDate.getFullYear()}-${String(travelDate.getMonth() + 1).padStart(2, '0')}-${String(travelDate.getDate()).padStart(2, '0')}`;

          for (let routeIdx = 0; routeIdx < dbRoutes.length; routeIdx++) {
            const route = dbRoutes[routeIdx];
            const routeId = route.id;
            const distKm = route.distance_km;
            const durationHrs = route.duration_hours;

            for (let i = 0; i < 4; i++) {
              const depTime = getStaggeredDepartureTime(routeId, i);
              const arrTime = calcArrival(depTime, durationHrs);
              const busId = busIds[(routeIdx * 4 + i) % busIds.length];
              const basePrice = calculateDynamicPrice(distKm, busId, i, routeId, day);
              scheduleStmt.run(routeId, busId, depTime, arrTime, basePrice, 40, dateStr);
              scheduleCount++;
            }
          }
        }

        scheduleStmt.finalize((err) => {
          if (err) {
            console.error(`❌ Error finalizing schedules: ${err.message}`);
            reject(err);
          } else {
            console.log(`✅ Created ${scheduleCount} schedules for ${endDayOffset - startDayOffset} days (${dbRoutes.length} routes × 4 buses × ${endDayOffset - startDayOffset} days)`);
            resolve(scheduleCount);
          }
        });
      });
    });
  });
}

// Add a single day's worth of schedules (or for a specific target route)
function addSchedulesForDate(routesData, dateStr, targetRouteId = null) {
  return new Promise((resolve) => {
    const routeFilterSql = targetRouteId ? 'WHERE id = ? ORDER BY id' : 'ORDER BY id';
    const routeFilterParams = targetRouteId ? [targetRouteId] : [];

    db.all(`SELECT id, from_city, to_city, distance_km, duration_hours FROM routes ${routeFilterSql}`, routeFilterParams, (routesErr, dbRoutes) => {
      if (routesErr || !dbRoutes || dbRoutes.length === 0) {
        if (routesErr) console.error('❌ Error fetching routes for addSchedulesForDate:', routesErr);
        return resolve(0);
      }

      db.all('SELECT id FROM buses ORDER BY id', (busesErr, dbBuses) => {
        const busIds = (!busesErr && dbBuses && dbBuses.length > 0)
          ? dbBuses.map(b => b.id)
          : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
        const dayOffset = getDayOffsetFromToday(dateStr);

        db.all('SELECT bus_id, route_id FROM stopped_route_services', (stoppedErr, stoppedRows) => {
          const stoppedSet = new Set((stoppedRows || []).map(r => `${r.bus_id}_${r.route_id}`));

          // Get existing schedule keys for this date to avoid duplicate inserts
          db.all('SELECT route_id, bus_id, departure_time FROM schedules WHERE travel_date = ?', [dateStr], (existErr, existSchedules) => {
            const existingSet = new Set((existSchedules || []).map(s => `${s.route_id}_${s.bus_id}_${s.departure_time}`));
            let scheduleCount = 0;
            const scheduleStmt = db.prepare('INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, base_price, available_seats, travel_date) VALUES (?, ?, ?, ?, ?, ?, ?)');

            for (let routeIdx = 0; routeIdx < dbRoutes.length; routeIdx++) {
              const route = dbRoutes[routeIdx];
              const routeId = route.id;
              const distKm = route.distance_km;
              const durationHrs = route.duration_hours;

              for (let i = 0; i < 4; i++) {
                const busId = busIds[(routeIdx * 4 + i) % busIds.length];
                if (stoppedSet.has(`${busId}_${routeId}`)) {
                  continue;
                }
                const depTime = getStaggeredDepartureTime(routeId, i);
                const key = `${routeId}_${busId}_${depTime}`;
                if (existingSet.has(key)) {
                  continue;
                }
                const arrTime = calcArrival(depTime, durationHrs);
                const basePrice = calculateDynamicPrice(distKm, busId, i, routeId, dayOffset);
                scheduleStmt.run(routeId, busId, depTime, arrTime, basePrice, 40, dateStr);
                scheduleCount++;
              }
            }

            scheduleStmt.finalize(() => {
              if (scheduleCount > 0) {
                console.log(`✅ Added ${scheduleCount} schedule(s) for ${dateStr}${targetRouteId ? ` (Route #${targetRouteId})` : ''}`);
              }
              resolve(scheduleCount);
            });
          });
        });
      });
    });
  });
}

function applyDataVariationMigrations(done) {
  console.log('ðŸ”§ Applying data variation migration (ratings, timings, prices)...');

  db.serialize(() => {
    db.all('SELECT id FROM buses ORDER BY id', (busErr, buses) => {
      if (busErr) {
        console.error('âŒ Bus migration read failed:', busErr.message);
      } else if (buses && buses.length > 0) {
        const updateBusRatingStmt = db.prepare('UPDATE buses SET rating = ? WHERE id = ?');
        buses.forEach((bus) => {
          const rating = Number((3.5 + ((bus.id * 13) % 16) * 0.1).toFixed(1));
          updateBusRatingStmt.run(Math.min(5.0, rating), bus.id);
        });
        updateBusRatingStmt.finalize();
      }

      db.all(`
        SELECT s.id, s.route_id, s.bus_id, s.travel_date, r.distance_km, r.duration_hours
        FROM schedules s
        JOIN routes r ON r.id = s.route_id
        ORDER BY s.id ASC
      `, (scheduleErr, schedules) => {
        if (scheduleErr) {
          console.error('âŒ Schedule migration read failed:', scheduleErr.message);
          if (typeof done === 'function') done();
          return;
        }

        if (!schedules || schedules.length === 0) {
          console.log('âœ… Data variation migration skipped (no schedules found)');
          if (typeof done === 'function') done();
          return;
        }

        const updateScheduleStmt = db.prepare('UPDATE schedules SET departure_time = ?, arrival_time = ?, base_price = ? WHERE id = ?');

        schedules.forEach((schedule) => {
          const slotIndex = (schedule.id - 1) % 4;
          const depTime = getStaggeredDepartureTime(schedule.route_id, slotIndex);
          const arrTime = calcArrival(depTime, schedule.duration_hours);
          const dayOffset = getDayOffsetFromToday(schedule.travel_date);
          const dynamicPrice = calculateDynamicPrice(schedule.distance_km, schedule.bus_id, slotIndex, schedule.route_id, dayOffset);
          updateScheduleStmt.run(depTime, arrTime, dynamicPrice, schedule.id);
        });

        updateScheduleStmt.finalize((finalizeErr) => {
          if (finalizeErr) {
            console.error('❌ Schedule migration update failed:', finalizeErr.message);
          } else {
            console.log(`✅ Data variation migration complete (${schedules.length} schedules updated)`);
          }

          if (typeof done === 'function') done();
        });
      });
    });
  });
}

// Cleanup old schedules and bookings, add new schedules for 35-day window
function performDailyCleanup(routesData) {
  const { getLocalDateString, getOffsetLocalDateString } = require('../utils/dateUtils');
  const today = new Date();
  const todayStr = getLocalDateString();
  const day35Str = getOffsetLocalDateString(34);
  
  console.log(`🧹 Daily cleanup running...`);
  console.log(`   📅 Local system date: ${todayStr} (${today.toLocaleString()})`);
  console.log(`   🗑️  Deleting all dates before: ${todayStr}`);
  console.log(`   ➕ Will ensure day 35 exists: ${day35Str}`);
  
  // If routesData not provided, query from database
  if (!routesData) {
    db.all('SELECT from_city, to_city, distance_km, duration_hours FROM routes', (err, routes) => {
      if (err) {
        console.error('❌ Error querying routes for cleanup:', err);
        return;
      }
      const routesDataFromDb = routes.map(r => [r.from_city, r.to_city, r.distance_km, r.duration_hours]);
      performDailyCleanupWithData(routesDataFromDb, todayStr, day35Str);
    });
  } else {
    performDailyCleanupWithData(routesData, todayStr, day35Str);
  }
}

function deduplicateSchedules(callback) {
  // Purge duplicate schedule rows keeping only the first (lowest ID) for each (route_id, bus_id, travel_date, departure_time)
  db.run(`
    DELETE FROM schedules
    WHERE id IN (
      SELECT s1.id
      FROM schedules s1
      INNER JOIN schedules s2 ON s1.route_id = s2.route_id 
        AND s1.bus_id = s2.bus_id 
        AND s1.travel_date = s2.travel_date 
        AND s1.departure_time = s2.departure_time
      WHERE s1.id > s2.id
    )
  `, function(err) {
    if (!err && this && this.changes > 0) {
      console.log(`✅ Deduplicated database: Purged ${this.changes} duplicate schedule entry/entries.`);
    }
    if (typeof callback === 'function') callback();
  });
}

function performDailyCleanupWithData(routesData, todayStr, day35Str) {
  console.log('');
  console.log('================================================================================');
  console.log('📅 DAILY CLEANUP PROCESS');
  console.log('================================================================================');
  
  // Deduplicate any accidental duplicate schedules first
  deduplicateSchedules();

  // First, check current date range in database
  db.get(`
    SELECT 
      MIN(travel_date) as first_date,
      MAX(travel_date) as last_date,
      COUNT(DISTINCT travel_date) as total_days,
      COUNT(*) as total_schedules
    FROM schedules
  `, (err, current) => {
    if (!err && current && current.total_schedules > 0) {
      console.log('📊 BEFORE CLEANUP:');
      console.log(`   First date: ${current.first_date}`);
      console.log(`   Last date: ${current.last_date}`);
      console.log(`   Total days: ${current.total_days}`);
      console.log(`   Total schedules: ${current.total_schedules}`);
    } else {
      console.log('📊 Database is empty or error occurred');
    }
    
    // Check what dates will be deleted
    db.all('SELECT DISTINCT travel_date FROM schedules WHERE travel_date < ? ORDER BY travel_date', [todayStr], (err, oldDates) => {
      if (err) {
        console.error('❌ Error checking old dates:', err);
        return;
      }
      
      console.log('');
      console.log('🔍 CLEANUP TARGETS:');
      if (oldDates && oldDates.length > 0) {
        console.log(`   ❌ Dates to DELETE: ${oldDates.map(d => d.travel_date).join(', ')}`);
      } else {
        console.log(`   ✅ No old dates to delete (all dates >= ${todayStr})`);
      }
      console.log(`   ➕ Date to ADD (if missing): ${day35Str} (day 35 from today)`);
      console.log('');
      
      // Perform the actual cleanup
      db.serialize(() => {
        // Delete old bookings first (foreign key constraint)
        db.run(`
          DELETE FROM bookings 
          WHERE schedule_id IN (
            SELECT id FROM schedules WHERE travel_date < ?
          )
        `, [todayStr], function(err) {
          if (err) {
            console.error('❌ Error deleting old bookings:', err);
          } else if (this.changes > 0) {
            console.log(`✅ Deleted ${this.changes} old booking(s)`);
          }
        });
        
        // Delete old seat locks
        db.run('DELETE FROM seat_locks WHERE expires_at < CURRENT_TIMESTAMP AT TIME ZONE \'UTC\'', function(err) {
          if (err) {
            console.error('❌ Error deleting expired seat locks:', err);
          } else if (this.changes > 0) {
            console.log(`✅ Deleted ${this.changes} expired seat lock(s)`);
          }
        });
        
        // Delete old schedules
        db.run('DELETE FROM schedules WHERE travel_date < ?', [todayStr], function(err) {
          if (err) {
            console.error('❌ Error deleting old schedules:', err);
          } else {
            if (this.changes > 0) {
              console.log(`✅ Deleted ${this.changes} old schedule(s) (before ${todayStr})`);
            } else {
              console.log(`✅ No old schedules to delete`);
            }
          }
        });

        // Delete orphan bookings referencing non-existent schedules/routes
        db.run(`
          DELETE FROM bookings
          WHERE schedule_id IN (
            SELECT id FROM schedules WHERE route_id NOT IN (SELECT id FROM routes) OR bus_id NOT IN (SELECT id FROM buses)
          )
        `, function(err) {
          if (!err && this && this.changes > 0) {
            console.log(`✅ Cleaned up ${this.changes} orphan booking(s)`);
          }
        });

        // Delete orphan schedules referencing non-existent routes or buses
        db.run('DELETE FROM schedules WHERE route_id NOT IN (SELECT id FROM routes) OR bus_id NOT IN (SELECT id FROM buses)', function(err) {
          if (!err && this && this.changes > 0) {
            console.log(`✅ Cleaned up ${this.changes} orphan schedule(s)`);
          }
        });
        
        // Ensure ALL 35 days exist for ALL active routes (fill any gaps per route)
        console.log('');
        console.log('🔍 Checking for missing route schedules in 35-day window...');
        
        const today = new Date();
        const { getOffsetLocalDateString } = require('../utils/dateUtils');
        const requiredDates = [];
        
        // Generate all 35 dates that should exist
        for (let dayOffset = 0; dayOffset < 35; dayOffset++) {
          requiredDates.push(getOffsetLocalDateString(dayOffset));
        }
        
        db.all('SELECT id FROM routes ORDER BY id', (allRoutesErr, allDbRoutes) => {
          if (allRoutesErr || !allDbRoutes || allDbRoutes.length === 0) {
            return;
          }
          const allRouteIds = allDbRoutes.map(r => r.id);
          let checkCompleted = 0;
          const totalChecks = requiredDates.length;
          let totalAddedSchedules = 0;

          requiredDates.forEach(dateStr => {
            // Find which routes already have schedules on this date
            db.all('SELECT DISTINCT route_id FROM schedules WHERE travel_date = ?', [dateStr], async (err, resultRows) => {
              checkCompleted++;
              const routesWithSchedules = new Set((resultRows || []).map(r => Number(r.route_id)));
              const missingRouteIds = allRouteIds.filter(id => !routesWithSchedules.has(id));

              if (missingRouteIds.length > 0) {
                for (const mRouteId of missingRouteIds) {
                  const added = await addSchedulesForDate(routesData, dateStr, mRouteId);
                  totalAddedSchedules += added;
                }
              }

              // When all checks are done, run final verification
              if (checkCompleted === totalChecks) {
                if (totalAddedSchedules === 0) {
                  console.log('✅ All 35 days fully populated for all routes - no schedule gaps found!');
                } else {
                  console.log(`✅ Filled a total of ${totalAddedSchedules} missing route schedule(s) across 35 days.`);
                }
                
                // Final verification
                setTimeout(() => {
                  db.get(`
                    SELECT 
                      MIN(travel_date) as first_date,
                      MAX(travel_date) as last_date,
                      COUNT(DISTINCT travel_date) as total_days,
                      COUNT(*) as total_schedules
                    FROM schedules
                  `, (err, final) => {
                    if (!err && final) {
                      console.log('');
                      console.log('📊 AFTER CLEANUP:');
                      console.log(`   First date: ${final.first_date} (should be ${todayStr})`);
                      console.log(`   Last date: ${final.last_date} (should be ${day35Str})`);
                      console.log(`   Total days: ${final.total_days}`);
                      console.log(`   Total schedules: ${final.total_schedules}`);
                      console.log('');
                      
                      // Verify we have at least 35 days
                      if (Number(final.total_days) >= 35 && final.first_date === todayStr) {
                        console.log('✅ SUCCESS: 35 days maintained! (' + todayStr + ' to ' + day35Str + ')');
                      } else {
                        console.log(`⚠️  WARNING: Expected 35 days, but found ${final.total_days} days`);
                      }
                      console.log('================================================================================');
                      console.log('');
                    }
                  });
                }, 1000);
              }
            });
          });
        });
      });
    });
  });
}

// Start the automatic cleanup service (monitors date changes constantly)
let lastKnownDate = null;

function startScheduleCleanupService(routesData) {
  const { getLocalDateString } = require('../utils/dateUtils');
  lastKnownDate = getLocalDateString();
  console.log(`🔄 Starting schedule cleanup service... Initial date tracked: ${lastKnownDate}`);

  // Run initial check to see if database has stale dates before today
  db.get('SELECT MIN(travel_date) as min_date FROM schedules', (err, row) => {
    if (!err && row && row.min_date && row.min_date < lastKnownDate) {
      console.log(`🧹 Stale schedule dates found in database (min date ${row.min_date} < today ${lastKnownDate}). Running immediate cleanup...`);
      performDailyCleanup(routesData);
    }
  });

  if (cleanupInterval) clearInterval(cleanupInterval);

  // Check every 30 seconds for real-world date rollover
  cleanupInterval = setInterval(() => {
    const currentDate = getLocalDateString();
    
    if (currentDate !== lastKnownDate) {
      console.log(`   New date: ${currentDate}`);
      console.log('   Running immediate cleanup...');
      console.log('');
      
      lastKnownDate = currentDate;
      performDailyCleanup(routesData);
    } else {
      // Regular hourly cleanup check (on the hour)
      const now = new Date();
      if (now.getMinutes() === 0) {
        console.log('ðŸ”„ Hourly cleanup check...');
        performDailyCleanup(routesData);
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes for date changes
}

// Stop the cleanup service
function stopScheduleCleanupService() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('â¹ï¸ Schedule cleanup service stopped');
  }
}

function ensureCompaniesAndBusesMigrated(done) {
  const db = getDatabase();
  db.get('SELECT COUNT(*) as count FROM companies', (err, row) => {
    if (err) {
      console.error('Error checking companies count:', err);
      if (done) done();
      return;
    }
    
    if (row && row.count > 0) {
      console.log('âœ… Companies already seeded');
      if (done) done();
      return;
    }
    
    console.log('ðŸŒ± Seeding default companies...');
    const bcrypt = require('bcryptjs');
    const companies = [
      { name: 'Orange Travels', email: 'orange@gmail.com', password: 'orange123' },
      { name: 'VRL Travels', email: 'vrl@gmail.com', password: 'vrl123' },
      { name: 'Kaveri Travels', email: 'kaveri@gmail.com', password: 'kaveri123' },
      { name: 'RedBus Fleet', email: 'redfleet@gmail.com', password: 'redfleet123' }
    ];
    
    let insertedCount = 0;
    const companyIds = {};
    
    companies.forEach(company => {
      bcrypt.hash(company.password, 10, (hashErr, hashedPassword) => {
        if (hashErr) {
          console.error('Bcrypt error:', hashErr);
          return;
        }
        db.run(
          'INSERT INTO companies (name, email, password) VALUES (?, ?, ?)',
          [company.name, company.email, hashedPassword],
          function(insertErr) {
            if (insertErr) {
              console.error(`Error inserting company ${company.name}:`, insertErr);
            } else {
              companyIds[company.name] = this.lastID;
            }
            insertedCount++;
            
            if (insertedCount === companies.length) {
              console.log('âœ… Companies seeded successfully:', companyIds);
              // Now migrate buses
              migrateBusesToCompanies(companyIds, done);
            }
          }
        );
      });
    });
  });
}

function migrateBusesToCompanies(companyIds, done) {
  const db = getDatabase();
  const mapping = {
    'VRL Travels': 'VRL Travels',
    'SRS Travels': 'VRL Travels',
    'RSRTC': 'VRL Travels',
    'IntrCity': 'VRL Travels',
    'Greenline': 'VRL Travels',
    
    'Orange Travels': 'Orange Travels',
    'Neeta Travels': 'Orange Travels',
    'Garuda': 'Orange Travels',
    'Dolphin': 'Orange Travels',
    
    'Kaveri': 'Kaveri Travels',
    'KPN Travels': 'Kaveri Travels',
    'Jabbar': 'Kaveri Travels',
    'Sharma': 'Kaveri Travels',
    'Parveen': 'Kaveri Travels',
    'Shrinath': 'Kaveri Travels',
    
    'RedBus': 'RedBus Fleet',
    'Purple': 'RedBus Fleet',
    'VE Travels': 'RedBus Fleet',
    'KSRTC': 'RedBus Fleet',
    'SETC': 'RedBus Fleet',
    'MSRTC': 'RedBus Fleet',
    'UPSRTC': 'RedBus Fleet',
    'Vijay Travels': 'RedBus Fleet'
  };
  
  db.all('SELECT id, operator FROM buses', (err, buses) => {
    if (err) {
      console.error('Error fetching buses for migration:', err);
      if (done) done();
      return;
    }
    
    if (!buses || buses.length === 0) {
      if (done) done();
      return;
    }
    
    let updatedCount = 0;
    let completedCount = 0;
    
    db.serialize(() => {
      const stmt = db.prepare('UPDATE buses SET company_id = ? WHERE id = ?');
      buses.forEach(bus => {
        const companyName = mapping[bus.operator] || 'RedBus Fleet';
        const companyId = companyIds[companyName];
        if (companyId) {
          stmt.run(companyId, bus.id, (stmtErr) => {
            completedCount++;
            if (completedCount === buses.length) {
              stmt.finalize(() => {
                console.log(`âœ… Migrated buses to companies`);
                if (done) done();
              });
            }
          });
          updatedCount++;
        } else {
          completedCount++;
          if (completedCount === buses.length) {
            stmt.finalize(() => {
              console.log(`âœ… Migrated buses to companies`);
              if (done) done();
            });
          }
        }
      });
    });
  });
}

function seedPlaces() {
  if (!db) return;
  
  db.all('SELECT LOWER(name) as name FROM deleted_places', (dErr, dRows) => {
    const deletedSet = new Set((dRows || []).map(r => r.name));

    const defaultPlaces = [
      { name: 'Hyderabad', state: 'Telangana', code: 'HYD', landmarks: 'Charminar, Gachibowli, Ameerpet, Hitech City', image_url: 'https://images.unsplash.com/photo-1605379399642-870262d3d051?auto=format&fit=crop&w=600&q=80' },
      { name: 'Bangalore', state: 'Karnataka', code: 'BLR', landmarks: 'Majestic, Electronic City, Silk Board, Indiranagar', image_url: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=600&q=80' },
      { name: 'Vijayawada', state: 'Andhra Pradesh', code: 'BZA', landmarks: 'Pandit Nehru Bus Station, Benz Circle, Kanaka Durga Temple', image_url: 'https://images.unsplash.com/photo-1627894483216-2138af692e32?auto=format&fit=crop&w=600&q=80' },
      { name: 'Chennai', state: 'Tamil Nadu', code: 'MAA', landmarks: 'Koyambedu Bus Terminus, Egmore, Tambaram, Marina', image_url: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?auto=format&fit=crop&w=600&q=80' },
      { name: 'Mumbai', state: 'Maharashtra', code: 'BOM', landmarks: 'Dadar, Borivali, Vashi, Thane, Gateway of India', image_url: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=600&q=80' },
      { name: 'Pune', state: 'Maharashtra', code: 'PNQ', landmarks: 'Swargate, Wakad, Viman Nagar, Hinjewadi', image_url: 'https://images.unsplash.com/photo-1606298855672-3efb63017be8?auto=format&fit=crop&w=600&q=80' },
      { name: 'Goa', state: 'Goa', code: 'GOI', landmarks: 'Panaji, Calangute, Margao, Baga', image_url: 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=600&q=80' },
      { name: 'Delhi', state: 'Delhi NCR', code: 'DEL', landmarks: 'ISBT Kashmiri Gate, Anand Vihar, Dhaula Kuan', image_url: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?auto=format&fit=crop&w=600&q=80' },
      { name: 'Jaipur', state: 'Rajasthan', code: 'JAI', landmarks: 'Sindhi Camp, Pink City, Amer', image_url: 'https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=600&q=80' },
      { name: 'Tirupati', state: 'Andhra Pradesh', code: 'TPT', landmarks: 'RTC Bus Stand, Alipiri, Kapila Theertham', image_url: 'https://images.unsplash.com/photo-1627894483216-2138af692e32?auto=format&fit=crop&w=600&q=80' },
      { name: 'Visakhapatnam', state: 'Andhra Pradesh', code: 'VTZ', landmarks: 'Dwaraka Bus Station, RK Beach, Gajuwaka', image_url: 'https://images.unsplash.com/photo-1605379399642-870262d3d051?auto=format&fit=crop&w=600&q=80' },
      { name: 'Kochi', state: 'Kerala', code: 'COK', landmarks: 'Vytilla Mobility Hub, Edappally, Fort Kochi', image_url: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=600&q=80' },
      { name: 'Kadapa', state: 'Andhra Pradesh', code: 'CDP', landmarks: 'RTC Bus Stand, Seven Roads Circle, RIMS', image_url: 'https://images.unsplash.com/photo-1627894483216-2138af692e32?auto=format&fit=crop&w=600&q=80' }
    ].filter(p => !deletedSet.has(p.name.trim().toLowerCase()));

    let insertedCount = 0;
    defaultPlaces.forEach(p => {
      db.run(
        `INSERT INTO places (name, state, code, image_url, landmarks, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT DO NOTHING`,
        [p.name, p.state, p.code, p.image_url, p.landmarks],
        (err) => {
          if (err) console.error(`Error inserting place ${p.name}:`, err.message);
          insertedCount++;
          if (insertedCount === defaultPlaces.length) {
            console.log('✅ Places seeded & updated (including Anantapur, Ananthapuram, Kadapa)');
            syncRouteCitiesToPlacesTable();
          }
        }
      );
    });
  });
}

function syncRouteCitiesToPlacesTable(callback) {
  db.all('SELECT LOWER(name) as name FROM deleted_places', (dErr, dRows) => {
    const deletedSet = new Set((dRows || []).map(r => r.name));

    db.all(`
      SELECT DISTINCT city FROM (
        SELECT from_city as city FROM routes WHERE from_city IS NOT NULL
        UNION
        SELECT to_city as city FROM routes WHERE to_city IS NOT NULL
      ) r
    `, (rErr, routeCities) => {
      if (rErr || !routeCities || routeCities.length === 0) {
        if (typeof callback === 'function') callback();
        return;
      }

      db.all('SELECT LOWER(name) as name FROM places', (pErr, placeRows) => {
        const existingPlacesSet = new Set((placeRows || []).map(r => r.name));

        const missingCities = routeCities.filter(c => {
          const nameLower = c.city.trim().toLowerCase();
          return !existingPlacesSet.has(nameLower) && !deletedSet.has(nameLower);
        });

        if (missingCities.length === 0) {
          if (typeof callback === 'function') callback();
          return;
        }

        console.log(`📌 Syncing ${missingCities.length} route cities to places table: ${missingCities.map(c => c.city).join(', ')}...`);

        let inserted = 0;
        missingCities.forEach(c => {
          const rawName = c.city.trim();
          const code = rawName.substring(0, 3).toUpperCase();
          db.run(
            `INSERT INTO places (name, state, code, is_active)
             VALUES (?, 'Andhra Pradesh', ?, 1)
             ON CONFLICT DO NOTHING`,
            [rawName, code],
            (err) => {
              if (err) console.error(`Error syncing route city ${rawName}:`, err.message);
              inserted++;
              if (inserted === missingCities.length) {
                console.log(`✅ Successfully synced ${inserted} route cities into places table!`);
                if (typeof callback === 'function') callback();
              }
            }
          );
        });
      });
    });
  });
}

function getDatabase() {
  if (!db) {
    initializeDatabase();
  }
  return db;
}

module.exports = { 
  initializeDatabase, 
  getDatabase,
  stopScheduleCleanupService,
  performDailyCleanup
};
