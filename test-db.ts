import { pool } from './server/db';

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database');
    const result = await client.query('SELECT NOW()');
    console.log('Current database time:', result.rows[0].now);
    client.release();
  } catch (error) {
    console.error('Database connection error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

testConnection();
