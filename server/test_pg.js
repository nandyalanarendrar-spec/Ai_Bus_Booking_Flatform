const { Client } = require('pg');

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres' // connect to default DB first to check if server exists
});

client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  });
