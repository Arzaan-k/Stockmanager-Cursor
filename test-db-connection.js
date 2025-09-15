import dotenv from 'dotenv';
dotenv.config();

console.log('Testing database connection...');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in environment variables');
  process.exit(1);
}

import { Pool } from '@neondatabase/serverless';

async function testConnection() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const client = await pool.connect();
    console.log('Successfully connected to the database');
    const result = await client.query('SELECT NOW()');
    console.log('Database time:', result.rows[0].now);
    client.release();
  } catch (error) {
    console.error('Database connection error:', error);
  } finally {
    await pool.end();
  }
}

testConnection().catch(console.error);
