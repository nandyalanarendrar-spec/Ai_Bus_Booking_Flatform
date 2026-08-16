const { Pool, types } = require('pg');

// SQLite compatibility: return dates as strings instead of Date objects
types.setTypeParser(1082, val => val); // DATE
types.setTypeParser(1114, val => new Date(val + 'Z')); // TIMESTAMP parsed as UTC

function buildConnectionConfig() {
  if (process.env.DATABASE_URL) {
    const url = process.env.DATABASE_URL.toLowerCase();
    const isCloudPostgres = url.includes('neon.tech') ||
                            url.includes('supabase.co') ||
                            url.includes('render.com') ||
                            url.includes('aivencloud.com') ||
                            url.includes('sslmode=require');

    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'true' || process.env.PGSSLMODE === 'require' || isCloudPostgres
        ? { rejectUnauthorized: false }
        : undefined,
      max: 20,
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 120000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    };
  }

  const config = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'AI_busbooking_flatform',
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  };

  if (process.env.PGSSLMODE === 'require') {
    config.ssl = { rejectUnauthorized: false };
  }

  return config;
}

function normalizeParams(params) {
  if (params === undefined || params === null) {
    return [];
  }

  return Array.isArray(params) ? params : [params];
}

function convertPlaceholders(sql) {
  let converted = '';
  let index = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let cursor = 0; cursor < sql.length; cursor += 1) {
    const char = sql[cursor];
    const nextChar = sql[cursor + 1];

    if (char === "'" && !inDoubleQuote) {
      converted += char;
      if (inSingleQuote && nextChar === "'") {
        converted += nextChar;
        cursor += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      converted += char;
      continue;
    }

    if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      converted += `$${index}`;
      index += 1;
      continue;
    }

    converted += char;
  }

  return converted;
}

function normalizeSql(sql) {
  return {
    sql: convertPlaceholders(String(sql).trim()),
    params: normalizeParams([]),
  };
}

function normalizeStatementArgs(args) {
  let values = Array.from(args);
  while (values.length > 0 && (values[values.length - 1] === undefined || values[values.length - 1] === null)) {
    values.pop();
  }
  let callback = null;

  if (values.length > 0 && typeof values[values.length - 1] === 'function') {
    callback = values.pop();
  }

  if (values.length === 1 && Array.isArray(values[0])) {
    return { params: values[0], callback };
  }

  return { params: values, callback };
}

class PgCompatDatabase {
  constructor() {
    this.pool = new Pool(buildConnectionConfig());

    // Prevent pool errors from crashing the entire Node process
    this.pool.on('error', (err) => {
      console.error('[DB Pool] Unexpected client error (non-fatal):', err.message);
    });

    // Retry ready check — Neon free tier can take up to 20s to wake from suspension
    this.ready = this._waitForConnection();
  }

  async _waitForConnection(retries = 5, delayMs = 3000) {
    for (let i = 1; i <= retries; i++) {
      try {
        await this.pool.query('SELECT 1');
        console.log('✅ Database connection established.');
        return;
      } catch (err) {
        console.warn(`[DB] Connection attempt ${i}/${retries} failed: ${err.message}`);
        if (i < retries) {
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          console.error('[DB] All connection attempts failed. Server will continue but DB queries may fail.');
          // Do NOT throw — let server start so we can show a proper error to users
        }
      }
    }
  }

  _query(sql, params = []) {
    const normalized = normalizeSql(sql);
    const finalSql = convertPlaceholders(normalized.sql);
    const finalParams = normalized.params.length ? normalized.params : normalizeParams(params);
    return this.pool.query(finalSql, finalParams);
  }

  run(sql, params, callback) {
    const { params: finalParams, callback: finalCallback } = normalizeStatementArgs(arguments.length > 1 ? Array.from(arguments).slice(1) : []);
    const isInsert = /^\s*insert\b/i.test(String(sql));
    const hasReturning = /\breturning\b/i.test(String(sql));

    const normalized = normalizeSql(sql);
    let statementSql = convertPlaceholders(normalized.sql);
    const queryParams = normalized.params.length ? normalized.params : finalParams;

    if (isInsert && !hasReturning) {
      statementSql = `${statementSql} RETURNING id`;
    }

    return this.pool.query(statementSql, queryParams)
      .then((result) => {
        const meta = {
          lastID: result.rows && result.rows[0] && result.rows[0].id ? result.rows[0].id : 0,
          changes: result.rowCount || 0,
        };

        if (finalCallback) {
          finalCallback.call(meta, null);
        }

        return meta;
      })
      .catch((error) => {
        if (finalCallback) {
          finalCallback.call({ lastID: 0, changes: 0 }, error);
        } else {
          console.error('[DB run] Query error (no callback):', error.message);
        }
        return null; // never re-throw — avoids unhandledRejection crashes
      });
  }

  get(sql, params, callback) {
    const { params: finalParams, callback: finalCallback } = normalizeStatementArgs(arguments.length > 1 ? Array.from(arguments).slice(1) : []);

    return this._query(sql, finalParams)
      .then((result) => {
        const row = (result.rows && result.rows[0]) ? result.rows[0] : null;

        if (finalCallback) {
          finalCallback(null, row);
        }

        return row;
      })
      .catch((error) => {
        if (finalCallback) {
          finalCallback(error);
        } else {
          console.error('[DB get] Query error (no callback):', error.message);
        }
        return null; // never re-throw
      });
  }

  all(sql, params, callback) {
    const { params: finalParams, callback: finalCallback } = normalizeStatementArgs(arguments.length > 1 ? Array.from(arguments).slice(1) : []);

    return this._query(sql, finalParams)
      .then((result) => {
        const rows = result.rows || [];

        if (finalCallback) {
          finalCallback(null, rows);
        }

        return rows;
      })
      .catch((error) => {
        if (finalCallback) {
          finalCallback(error, []);
        } else {
          console.error('[DB all] Query error (no callback):', error.message);
        }
        return []; // never re-throw
      });
  }

  serialize(callback) {
    if (typeof callback === 'function') {
      callback();
    }
  }

  prepare(sql) {
    return {
      run: (...args) => {
        const { params, callback } = normalizeStatementArgs(args);
        return this.run(sql, params, callback);
      },
      finalize: (callback) => {
        if (typeof callback === 'function') {
          callback(null);
        }
        return Promise.resolve();
      },
    };
  }

  close(callback) {
    return this.pool.end()
      .then(() => {
        if (typeof callback === 'function') callback(null);
      })
      .catch((err) => {
        if (typeof callback === 'function') callback(err);
      });
  }
}

function createDatabase() {
  return new PgCompatDatabase();
}

module.exports = {
  createDatabase,
  normalizeSql,
};