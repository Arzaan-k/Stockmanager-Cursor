import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const result = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'vendors'
  `);
  console.log('Vendor table columns:');
  result.rows.forEach(row => console.log(`  - ${row.column_name}`));
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await pool.end();
}
