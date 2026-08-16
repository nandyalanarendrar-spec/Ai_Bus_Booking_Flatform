/**
 * Database utility wrapper for async -> promise conversion.
 * The database client exposes callback-style methods; this wrapper provides
 * promise-based helpers so agents can use async/await cleanly.
 */
const { getDatabase } = require('../database/init');

/**
 * Run a SELECT query that returns a single row.
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} Single row or null
 */
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

/**
 * Run a SELECT query that returns multiple rows.
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of rows
 */
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Run an INSERT/UPDATE/DELETE query.
 * @param {string} sql - SQL statement
 * @param {Array} params - Query parameters
 * @returns {Promise<{lastID: number, changes: number}>} Result with lastID and changes count
 */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

module.exports = { dbGet, dbAll, dbRun };
