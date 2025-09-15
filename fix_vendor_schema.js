import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

async function fixSchema() {
  try {
    console.log('🔧 Fixing vendor table schema...');
    
    // Make contact_number nullable
    await sql`ALTER TABLE vendors ALTER COLUMN contact_number DROP NOT NULL`;
    console.log('✅ Made contact_number nullable');
    
    // Also make location nullable since it can be empty
    await sql`ALTER TABLE vendors ALTER COLUMN location DROP NOT NULL`;
    console.log('✅ Made location nullable');
    
    // Make city nullable
    await sql`ALTER TABLE vendors ALTER COLUMN city DROP NOT NULL`;
    console.log('✅ Made city nullable');
    
    // Make state nullable
    await sql`ALTER TABLE vendors ALTER COLUMN state DROP NOT NULL`;
    console.log('✅ Made state nullable');
    
  } catch (error) {
    console.error('❌ Error fixing schema:', error);
  }
}

fixSchema();
