#!/usr/bin/env node

/**
 * Manually run vendor table migration
 */

import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function runMigration() {
  try {
    console.log('🚀 Creating vendor tables...');
    
    // Create vendors table
    await sql`
      CREATE TABLE IF NOT EXISTS "vendors" (
        "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "main_category" text NOT NULL,
        "subcategory" text NOT NULL,
        "product_type" text NOT NULL,
        "product_code" text NOT NULL UNIQUE,
        "other_products" text,
        "contact_number" text,
        "email" text,
        "location" text NOT NULL,
        "address" text,
        "city" text NOT NULL,
        "state" text NOT NULL,
        "zone" text,
        "status" text DEFAULT 'pending' NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "created_by" varchar,
        "notes" text,
        "rating" text,
        "bank_details" jsonb,
        "documents" jsonb,
        "tax_info" jsonb
      )
    `;
    
    // Create vendor contacts table
    await sql`
      CREATE TABLE IF NOT EXISTS "vendor_contacts" (
        "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
        "vendor_id" varchar NOT NULL,
        "name" text NOT NULL,
        "designation" text,
        "phone" text,
        "email" text,
        "is_primary" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    
    // Create vendor products mapping table
    await sql`
      CREATE TABLE IF NOT EXISTS "vendor_products" (
        "id" varchar DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
        "vendor_id" varchar NOT NULL,
        "product_id" varchar NOT NULL,
        "supplier_code" text,
        "price" text,
        "lead_time_days" text,
        "minimum_order_quantity" text,
        "is_preferred" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `;
    
    // Add foreign key constraints with error handling
    try {
      await sql`
        ALTER TABLE "vendor_contacts" 
        ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" 
        FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") 
        ON DELETE cascade ON UPDATE no action
      `;
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.log('Note: Foreign key constraint might already exist');
      }
    }
    
    try {
      await sql`
        ALTER TABLE "vendor_products" 
        ADD CONSTRAINT "vendor_products_vendor_id_vendors_id_fk" 
        FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") 
        ON DELETE cascade ON UPDATE no action
      `;
    } catch (e) {
      if (!e.message.includes('already exists')) {
        console.log('Note: Foreign key constraint might already exist');
      }
    }
    
    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS "idx_vendors_status" ON "vendors" ("status")`;
    await sql`CREATE INDEX IF NOT EXISTS "idx_vendors_category" ON "vendors" ("main_category")`;
    await sql`CREATE INDEX IF NOT EXISTS "idx_vendors_zone" ON "vendors" ("zone")`;
    await sql`CREATE INDEX IF NOT EXISTS "idx_vendors_active" ON "vendors" ("is_active")`;
    await sql`CREATE INDEX IF NOT EXISTS "idx_vendor_contacts_vendor" ON "vendor_contacts" ("vendor_id")`;
    await sql`CREATE INDEX IF NOT EXISTS "idx_vendor_products_vendor" ON "vendor_products" ("vendor_id")`;
    
    console.log('✅ Vendor tables created successfully!');
    
    // Test connection
    const result = await sql`SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'vendor%'`;
    console.log('📋 Created tables:', result.map(r => r.table_name));
    
  } catch (error) {
    console.error('❌ Error creating vendor tables:', error);
    throw error;
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
