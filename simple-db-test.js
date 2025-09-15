// Simple script to test database connection
console.log('Starting database connection test...');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_KH2CYZVt8GrF@ep-wandering-morning-afvvs67s.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require'
});

async function testConnection() {
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
    console.log('Connection closed');
  }
}

testConnection().catch(console.error);
