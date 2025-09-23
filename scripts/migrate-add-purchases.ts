import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function migrateAddPurchases() {
  console.log('Adding purchases table...');
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchases (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        items TEXT NOT NULL,
        "totalAmount" NUMERIC(10,2) NOT NULL DEFAULT 0.00,
        status TEXT NOT NULL DEFAULT 'pending',
        "invoiceImageUrl" TEXT,
        notes TEXT,
        timestamp TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ purchases table created successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  }
}

migrateAddPurchases().catch(console.error);


