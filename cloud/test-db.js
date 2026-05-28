const { Client } = require('pg');
require('dotenv').config({ path: '../.env' });

async function test() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('Connected to DB successfully!');
    const res = await client.query('SELECT * FROM users LIMIT 1');
    console.log('Users query:', res.rows);
  } catch (err) {
    console.error('DB Connection error:', err);
  } finally {
    await client.end();
  }
}

test();
