import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb, pgEnum, unique, foreignKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for authentication and role management
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("staff"), // admin, staff, viewer, customer
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Warehouses table
export const warehouses = pgTable("warehouses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  address: text("address"),
  gpsCoordinates: jsonb("gps_coordinates"), // {lat: number, lng: number}
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku").notNull().unique(),
  type: text("type").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }),
  stockTotal: integer("stock_total").notNull().default(0),
  stockUsed: integer("stock_used").notNull().default(0),
  stockAvailable: integer("stock_available").notNull().default(0),
  minStockLevel: integer("min_stock_level").default(10),
  imageUrl: text("image_url"),
  // Extended business fields
  groupCode: text("group_code"),
  groupName: text("group_name"),
  crystalPartCode: text("crystal_part_code"),
  listOfItems: text("list_of_items"),
  photos: jsonb("photos"), // array of URLs or objects
  mfgPartCode: text("mfg_part_code"),
  importance: text("importance"), // e.g., Critical, High, Medium
  highValue: text("high_value"), // kept as text to support values like "Yes"/"No"/scores
  maximumUsagePerMonth: integer("maximum_usage_per_month"),
  sixMonthsUsage: integer("six_months_usage"),
  averagePerDay: decimal("average_per_day", { precision: 10, scale: 2 }),
  leadTimeDays: integer("lead_time_days"),
  criticalFactorOneDay: integer("critical_factor_one_day"),
  units: text("units"),
  minimumInventoryPerDay: integer("minimum_inventory_per_day"),
  maximumInventoryPerDay: integer("maximum_inventory_per_day"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Warehouse stock - junction table for product locations
export const warehouseStock = pgTable("warehouse_stock", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  warehouseId: varchar("warehouse_id").notNull().references(() => warehouses.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(0),
  aisle: text("aisle"),
  rack: text("rack"),
  boxNumber: text("box_number"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Customers table
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  customerId: varchar("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  // Additional business metadata
  jobOrder: text("job_order"),
  containerNumber: text("container_number"),
  location: text("location"),
  status: text("status").notNull().default("pending"), // pending, needs_approval, approved, shipped, delivered, cancelled
  // Approval workflow metadata
  approvalStatus: text("approval_status"), // mirrors status for quick filters
  approvalRequestedAt: timestamp("approval_requested_at"),
  approvalRequestedBy: text("approval_requested_by"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  approvalNotes: text("approval_notes"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Order items table
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
});

// Stock movements table for audit trail
export const stockMovements = pgTable("stock_movements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  warehouseId: varchar("warehouse_id").references(() => warehouses.id),
  action: text("action").notNull(), // add, use, transfer, adjust
  quantity: integer("quantity").notNull(),
  previousStock: integer("previous_stock"),
  newStock: integer("new_stock"),
  reason: text("reason"),
  userId: varchar("user_id").references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// WhatsApp logs table
export const whatsappLogs = pgTable("whatsapp_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userPhone: text("user_phone").notNull(),
  productId: varchar("product_id").references(() => products.id),
  action: text("action"), // stock_add, stock_use, order_create, product_inquiry
  quantity: integer("quantity"),
  aiResponse: text("ai_response"),
  imageUrl: text("image_url"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  status: text("status").default("pending"), // pending, processed, failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// WhatsApp conversations (per phone number) and messages for full chat history
export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userPhone: text("user_phone").notNull(),
  status: text("status").notNull().default("open"), // open, pending, closed
  assignedToUserId: varchar("assigned_to_user_id").references(() => users.id),
  state: jsonb("state"), // arbitrary state: { cart: [{productId, qty}], step: 'collect_details', customer:{...} }
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => whatsappConversations.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // inbound, outbound
  sender: text("sender").notNull(), // 'user' or 'agent'
  body: text("body").notNull(),
  meta: jsonb("meta"), // raw webhook or send response
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// GRN header table linked to orders
export const grns = pgTable("grns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  vendorName: text("vendor_name"),
  vendorBillNo: text("vendor_bill_no"),
  indentNo: text("indent_no"),
  poNo: text("po_no"),
  challanNo: text("challan_no"),
  grnDate: timestamp("grn_date"),
  vendorBillDate: timestamp("vendor_bill_date"),
  poDate: timestamp("po_date"),
  jobOrderNo: text("job_order_no"),
  location: text("location"),
  receivedBy: text("received_by"),
  personName: text("person_name"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// GRN line items
export const grnItems = pgTable("grn_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  grnId: varchar("grn_id").notNull().references(() => grns.id, { onDelete: "cascade" }),
  srNo: integer("sr_no"),
  mfgPartCode: text("mfg_part_code"),
  requiredPart: text("required_part"), // REQUIRED SPARE PART(S) / CONSUMABLE(S)
  makeModel: text("make_model"),
  partNo: text("part_no"),
  condition: text("condition"), // New/Old/Refurbished
  qtyUnit: text("qty_unit"), // e.g., PCs
  rate: decimal("rate", { precision: 12, scale: 2 }),
  quantity: decimal("quantity", { precision: 12, scale: 2 }),
  amount: decimal("amount", { precision: 12, scale: 2 }),
});

// Add after existing tables
export const purchases = pgTable('purchases', {
  id: varchar("id").default(sql`gen_random_uuid()`).primaryKey(),
  userId: varchar("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  items: text('items').notNull(), // JSON string of array {productId, name, sku, quantity, unitPrice, total}
  totalAmount: decimal('totalAmount', { precision: 10, scale: 2 }).notNull().default('0.00'),
  status: text('status').notNull().default('pending'),
  invoiceImageUrl: text('invoiceImageUrl'),
  notes: text('notes'),
  timestamp: timestamp('timestamp').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  stockMovements: many(stockMovements),
}));

export const warehousesRelations = relations(warehouses, ({ many }) => ({
  warehouseStock: many(warehouseStock),
  stockMovements: many(stockMovements),
}));

export const productsRelations = relations(products, ({ many }) => ({
  warehouseStock: many(warehouseStock),
  orderItems: many(orderItems),
  stockMovements: many(stockMovements),
  whatsappLogs: many(whatsappLogs),
}));

export const warehouseStockRelations = relations(warehouseStock, ({ one }) => ({
  product: one(products, {
    fields: [warehouseStock.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [warehouseStock.warehouseId],
    references: [warehouses.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  orderItems: many(orderItems),
  grns: many(grns),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  warehouse: one(warehouses, {
    fields: [stockMovements.warehouseId],
    references: [warehouses.id],
  }),
  user: one(users, {
    fields: [stockMovements.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [stockMovements.orderId],
    references: [orders.id],
  }),
}));

export const whatsappLogsRelations = relations(whatsappLogs, ({ one }) => ({
  product: one(products, {
    fields: [whatsappLogs.productId],
    references: [products.id],
  }),
}));

export const whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  assignedTo: one(users, {
    fields: [whatsappConversations.assignedToUserId],
    references: [users.id],
  }),
  messages: many(whatsappMessages),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappMessages.conversationId],
    references: [whatsappConversations.id],
  }),
}));

export const grnsRelations = relations(grns, ({ one, many }) => ({
  order: one(orders, {
    fields: [grns.orderId],
    references: [orders.id],
  }),
  items: many(grnItems),
}));

export const grnItemsRelations = relations(grnItems, ({ one }) => ({
  grn: one(grns, {
    fields: [grnItems.grnId],
    references: [grns.id],
  }),
}));

export const purchasesRelations = relations(purchases, ({ one }) => ({
  user: one(users, {
    fields: [purchases.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({
  id: true,
  createdAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  orderNumber: true,
});

export const insertOrderItemSchema = createInsertSchema(orderItems).omit({
  id: true,
  orderId: true, // assigned after order creation
});

export const insertGrnSchema = createInsertSchema(grns).omit({
  id: true,
  createdAt: true,
});

export const insertGrnItemSchema = createInsertSchema(grnItems).omit({
  id: true,
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({
  id: true,
  createdAt: true,
});

export const insertWhatsappLogSchema = createInsertSchema(whatsappLogs).omit({
  id: true,
  createdAt: true,
});

export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  createdAt: true,
});

export const insertPurchaseSchema = createInsertSchema(purchases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Warehouse = typeof warehouses.$inferSelect;
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type WarehouseStock = typeof warehouseStock.$inferSelect;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;

export type WhatsappLog = typeof whatsappLogs.$inferSelect;
export type InsertWhatsappLog = z.infer<typeof insertWhatsappLogSchema>;

export type WhatsappConversation = typeof whatsappConversations.$inferSelect;
export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;

export type Grn = typeof grns.$inferSelect;
export type InsertGrn = z.infer<typeof insertGrnSchema>;
export type GrnItem = typeof grnItems.$inferSelect;
export type InsertGrnItem = z.infer<typeof insertGrnItemSchema>;

export type Purchase = typeof purchases.$inferSelect;
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;

// Vendor Schema
// Vendor status enum
export const vendorStatus = pgEnum("vendor_status", ['active', 'inactive', 'pending', 'suspended']);

// Vendor categories enum
export const vendorCategory = pgEnum("vendor_category", ['admin', 'operation_services']);

// Main vendors table
export const vendors = pgTable("vendors", {
  id: varchar("id").default(sql`gen_random_uuid()`).primaryKey(),
  name: text("name").notNull(),
  mainCategory: text("main_category").notNull(),
  subcategory: text("subcategory").notNull(),
  productType: text("product_type").notNull(),
  productCode: text("product_code").notNull().unique(),
  otherProducts: text("other_products"),
  contactNumber: text("contact_number").notNull(),
  email: text("email"),
  location: text("location").notNull(),
  address: text("address"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zone: text("zone"),
  status: text("status").notNull().default('pending'),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  notes: text("notes"),
  rating: text("rating"),
  bankDetails: jsonb("bank_details"),
  documents: jsonb("documents"),
  taxInfo: jsonb("tax_info"),
});

// Vendor products mapping table
export const vendorProducts = pgTable("vendor_products", {
  id: varchar("id").default(sql`gen_random_uuid()`).primaryKey(),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  supplierCode: text("supplier_code"),
  price: text("price"),
  leadTimeDays: text("lead_time_days"),
  minimumOrderQuantity: text("minimum_order_quantity"),
  isPreferred: boolean("is_preferred").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Vendor contacts table
export const vendorContacts = pgTable("vendor_contacts", {
  id: varchar("id").default(sql`gen_random_uuid()`).primaryKey(),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  designation: text("designation"),
  phone: text("phone"),
  email: text("email"),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Vendor transactions
export const vendorTransactions = pgTable("vendor_transactions", {
  id: varchar("id").default(sql`gen_random_uuid()`).primaryKey(),
  vendorId: varchar("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  transactionType: text("transaction_type").notNull(),
  amount: text("amount").notNull(),
  currency: text("currency").default('INR'),
  referenceNumber: text("reference_number"),
  description: text("description"),
  transactionDate: timestamp("transaction_date").notNull().defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  documents: jsonb("documents"),
  status: text("status").default('completed'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Vendor Types
export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;
export type VendorProduct = typeof vendorProducts.$inferSelect;
export type InsertVendorProduct = typeof vendorProducts.$inferInsert;
export type VendorContact = typeof vendorContacts.$inferSelect;
export type InsertVendorContact = typeof vendorContacts.$inferInsert;
export type VendorTransaction = typeof vendorTransactions.$inferSelect;
export type InsertVendorTransaction = typeof vendorTransactions.$inferInsert;

// Product Images table for storing images in database
export const productImages = pgTable("product_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(), // base64 encoded image data
  size: integer("size").notNull(), // size in bytes
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProductImage = typeof productImages.$inferSelect;
export type InsertProductImage = typeof productImages.$inferInsert;