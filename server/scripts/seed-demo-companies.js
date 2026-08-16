const bcrypt = require('bcryptjs');
const { getDatabase } = require('../database/init');

const demoCompanies = [
  { name: 'Orange Travels', email: 'orange@gmail.com', password: 'orange123' },
  { name: 'VRL Travels', email: 'vrl@gmail.com', password: 'vrl123' },
  { name: 'Kaveri Travels', email: 'kaveri@gmail.com', password: 'kaveri123' },
  { name: 'RedBus Fleet', email: 'redfleet@gmail.com', password: 'redfleet123' },
];

(async () => {
  const db = getDatabase();
  for (const comp of demoCompanies) {
    const existing = await new Promise((resolve) => {
      db.get('SELECT id FROM companies WHERE LOWER(email) = ?', [comp.email.toLowerCase()], (err, row) => {
        if (err) return resolve(null);
        resolve(row);
      });
    });
    if (existing) {
      console.log(`Company ${comp.email} already exists`);
      continue;
    }
    const hash = await bcrypt.hash(comp.password, 10);
    db.run(
      `INSERT INTO companies (name, email, password_hash, status) VALUES (?, ?, ?, 'ACTIVE')`,
      [comp.name, comp.email, hash],
      (err) => {
        if (err) console.error('Insert error', err);
        else console.log(`Inserted ${comp.email}`);
      }
    );
  }
})();
