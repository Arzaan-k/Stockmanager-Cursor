-- Add vendor status and category enums
DO $$ BEGIN
 CREATE TYPE "public"."vendor_status" AS ENUM('active', 'inactive', 'pending', 'suspended');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."vendor_category" AS ENUM('admin', 'operation_services');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create vendors table
CREATE TABLE IF NOT EXISTS "vendors" (
	"id" varchar DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"main_category" text NOT NULL,
	"subcategory" text NOT NULL,
	"product_type" text NOT NULL,
	"product_code" text NOT NULL UNIQUE,
	"other_products" text,
	"contact_number" text NOT NULL,
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
);

-- Create vendor products mapping table
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
);

-- Create vendor contacts table
CREATE TABLE IF NOT EXISTS "vendor_contacts" (
	"id" varchar DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
	"vendor_id" varchar NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Create vendor transactions table
CREATE TABLE IF NOT EXISTS "vendor_transactions" (
	"id" varchar DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
	"vendor_id" varchar NOT NULL,
	"transaction_type" text NOT NULL,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'INR',
	"reference_number" text,
	"description" text,
	"transaction_date" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar,
	"documents" jsonb,
	"status" text DEFAULT 'completed',
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "vendor_products" ADD CONSTRAINT "vendor_products_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "vendor_products" ADD CONSTRAINT "vendor_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_vendors_status" ON "vendors" ("status");
CREATE INDEX IF NOT EXISTS "idx_vendors_category" ON "vendors" ("main_category");
CREATE INDEX IF NOT EXISTS "idx_vendors_zone" ON "vendors" ("zone");
CREATE INDEX IF NOT EXISTS "idx_vendors_active" ON "vendors" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_vendor_contacts_vendor" ON "vendor_contacts" ("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_products_vendor" ON "vendor_products" ("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_vendor_transactions_vendor" ON "vendor_transactions" ("vendor_id");
