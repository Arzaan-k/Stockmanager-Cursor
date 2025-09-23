import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function migrateAddPoDrafts() {
  console.log('Adding po_drafts table...');
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS po_drafts (
        order_id VARCHAR(255) PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
        header JSONB,
        items JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ po_drafts table created successfully');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exitCode = 1;
  }
}

migrateAddPoDrafts().catch(console.error);


