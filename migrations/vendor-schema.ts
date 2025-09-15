import { pgTable, varchar, text, timestamp, boolean, pgEnum, jsonb, unique, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { products, users } from "./schema";

// Vendor status enum
export const vendorStatus = pgEnum("vendor_status", ['active', 'inactive', 'pending', 'suspended']);

// Vendor categories enum
export const vendorCategory = pgEnum("vendor_category", ['admin', 'operation_services']);

// Main vendors table
export const vendors = pgTable("vendors", {
  id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  name: text().notNull(),
  mainCategory: text("main_category").notNull(),
  subcategory: text().notNull(),
  productType: text("product_type").notNull(),
  productCode: text("product_code").notNull(),
  otherProducts: text("other_products"),
  contactNumber: text("contact_number").notNull(),
  email: text(),
  location: text().notNull(),
  address: text(),
  city: text().notNull(),
  state: text().notNull(),
  zone: text(),
  status: vendorStatus().default('pending').notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
  createdBy: varchar("created_by"),
  notes: text(),
  rating: text(), // Can be converted to numeric if needed
  fullContactInfo: jsonb("full_contact_info"), // Preserve existing contact info
  bankDetails: jsonb("bank_details"),
  documents: jsonb(), // Store document URLs and metadata
  taxInfo: jsonb("tax_info"), // GST, PAN, etc.
}, (table) => [
  unique("vendors_product_code_unique").on(table.productCode),
  foreignKey({
    columns: [table.createdBy],
    foreignColumns: [users.id],
    name: "vendors_created_by_users_id_fk"
  }),
]);

// Vendor products mapping table (many-to-many relationship)
export const vendorProducts = pgTable("vendor_products", {
  id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  vendorId: varchar("vendor_id").notNull(),
  productId: varchar("product_id").notNull(),
  supplierCode: text("supplier_code"),
  price: text(), // Can be numeric if needed
  leadTimeDays: text("lead_time_days"),
  minimumOrderQuantity: text("minimum_order_quantity"),
  isPreferred: boolean("is_preferred").default(false),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.vendorId],
    foreignColumns: [vendors.id],
    name: "vendor_products_vendor_id_vendors_id_fk"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.productId],
    foreignColumns: [products.id],
    name: "vendor_products_product_id_products_id_fk"
  }).onDelete("cascade"),
  unique("vendor_products_unique").on(table.vendorId, table.productId),
]);

// Vendor contacts table (multiple contacts per vendor)
export const vendorContacts = pgTable("vendor_contacts", {
  id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  vendorId: varchar("vendor_id").notNull(),
  name: text().notNull(),
  designation: text(),
  phone: text(),
  email: text(),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.vendorId],
    foreignColumns: [vendors.id],
    name: "vendor_contacts_vendor_id_vendors_id_fk"
  }).onDelete("cascade"),
]);

// Vendor transactions/purchase history
export const vendorTransactions = pgTable("vendor_transactions", {
  id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  vendorId: varchar("vendor_id").notNull(),
  transactionType: text("transaction_type").notNull(), // 'purchase', 'payment', 'return'
  amount: text().notNull(),
  currency: text().default('INR'),
  referenceNumber: text("reference_number"),
  description: text(),
  transactionDate: timestamp("transaction_date", { mode: 'string' }).defaultNow().notNull(),
  createdBy: varchar("created_by"),
  documents: jsonb(), // Invoices, receipts
  status: text().default('completed'),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.vendorId],
    foreignColumns: [vendors.id],
    name: "vendor_transactions_vendor_id_vendors_id_fk"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.createdBy],
    foreignColumns: [users.id],
    name: "vendor_transactions_created_by_users_id_fk"
  }),
]);
