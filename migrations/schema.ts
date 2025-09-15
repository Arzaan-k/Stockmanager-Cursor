import { pgTable, foreignKey, unique, varchar, text, numeric, timestamp, integer, jsonb, boolean, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const userRole = pgEnum("user_role", ['admin', 'staff', 'viewer'])


export const orders = pgTable("orders", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	status: text().default('pending').notNull(),
	customerId: varchar("customer_id"),
	total: numeric({ precision: 10, scale:  2 }).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	orderNumber: text("order_number").notNull(),
	customerName: text("customer_name").notNull(),
	customerEmail: text("customer_email"),
	customerPhone: text("customer_phone"),
	jobOrder: text("job_order"),
	containerNumber: text("container_number"),
	location: text(),
	subtotal: numeric({ precision: 10, scale:  2 }).notNull(),
	tax: numeric({ precision: 10, scale:  2 }).default('0').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "orders_customer_id_customers_id_fk"
		}),
	unique("orders_order_number_unique").on(table.orderNumber),
]);

export const orderItems = pgTable("order_items", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	orderId: varchar("order_id").notNull(),
	productId: varchar("product_id").notNull(),
	quantity: integer().notNull(),
	unitPrice: numeric("unit_price", { precision: 10, scale:  2 }).notNull(),
	totalPrice: numeric("total_price", { precision: 10, scale:  2 }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "order_items_order_id_orders_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "order_items_product_id_products_id_fk"
		}),
]);

export const customers = pgTable("customers", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: text().notNull(),
	phone: text(),
	email: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	address: text(),
	city: text(),
});

export const stockMovements = pgTable("stock_movements", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	productId: varchar("product_id").notNull(),
	warehouseId: varchar("warehouse_id"),
	reason: text(),
	orderId: varchar("order_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	action: text().notNull(),
	quantity: integer().notNull(),
	previousStock: integer("previous_stock"),
	newStock: integer("new_stock"),
	userId: varchar("user_id"),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "stock_movements_product_id_products_id_fk"
		}),
	foreignKey({
			columns: [table.warehouseId],
			foreignColumns: [warehouses.id],
			name: "stock_movements_warehouse_id_warehouses_id_fk"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "stock_movements_user_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "stock_movements_order_id_orders_id_fk"
		}),
]);

export const warehouses = pgTable("warehouses", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	name: text().notNull(),
	location: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	address: text(),
	gpsCoordinates: jsonb("gps_coordinates"),
	isActive: boolean("is_active").default(true).notNull(),
});

export const users = pgTable("users", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	email: text().notNull(),
	role: text().default('staff').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	username: text().notNull(),
	password: text().notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	phone: text(),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	unique("users_email_unique").on(table.email),
	unique("users_username_unique").on(table.username),
]);

export const products = pgTable("products", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	sku: text().notNull(),
	name: text().notNull(),
	description: text(),
	type: text().notNull(),
	imageUrl: text("image_url"),
	price: numeric({ precision: 10, scale:  2 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	stockTotal: integer("stock_total").default(0).notNull(),
	stockUsed: integer("stock_used").default(0).notNull(),
	stockAvailable: integer("stock_available").default(0).notNull(),
	minStockLevel: integer("min_stock_level").default(10),
	groupCode: text("group_code"),
	groupName: text("group_name"),
	crystalPartCode: text("crystal_part_code"),
	listOfItems: text("list_of_items"),
	photos: jsonb(),
	mfgPartCode: text("mfg_part_code"),
	importance: text(),
	highValue: text("high_value"),
	maximumUsagePerMonth: integer("maximum_usage_per_month"),
	sixMonthsUsage: integer("six_months_usage"),
	averagePerDay: numeric("average_per_day", { precision: 10, scale:  2 }),
	leadTimeDays: integer("lead_time_days"),
	criticalFactorOneDay: integer("critical_factor_one_day"),
	units: text(),
	minimumInventoryPerDay: integer("minimum_inventory_per_day"),
	maximumInventoryPerDay: integer("maximum_inventory_per_day"),
	isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
	unique("products_sku_unique").on(table.sku),
]);

export const warehouseStock = pgTable("warehouse_stock", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	productId: varchar("product_id").notNull(),
	warehouseId: varchar("warehouse_id").notNull(),
	quantity: integer().default(0).notNull(),
	aisle: text(),
	rack: text(),
	boxNumber: text("box_number"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "warehouse_stock_product_id_products_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.warehouseId],
			foreignColumns: [warehouses.id],
			name: "warehouse_stock_warehouse_id_warehouses_id_fk"
		}).onDelete("cascade"),
]);

export const whatsappLogs = pgTable("whatsapp_logs", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userPhone: text("user_phone").notNull(),
	productId: varchar("product_id"),
	action: text(),
	quantity: integer(),
	aiResponse: text("ai_response"),
	imageUrl: text("image_url"),
	confidence: numeric({ precision: 5, scale:  4 }),
	status: text().default('pending'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "whatsapp_logs_product_id_products_id_fk"
		}),
]);

export const whatsappConversations = pgTable("whatsapp_conversations", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	userPhone: text("user_phone").notNull(),
	status: text().default('open').notNull(),
	assignedToUserId: varchar("assigned_to_user_id"),
	state: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.assignedToUserId],
			foreignColumns: [users.id],
			name: "whatsapp_conversations_assigned_to_user_id_users_id_fk"
		}),
]);

export const whatsappMessages = pgTable("whatsapp_messages", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	conversationId: varchar("conversation_id").notNull(),
	direction: text().notNull(),
	sender: text().notNull(),
	body: text().notNull(),
	meta: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.conversationId],
			foreignColumns: [whatsappConversations.id],
			name: "whatsapp_messages_conversation_id_whatsapp_conversations_id_fk"
		}).onDelete("cascade"),
]);

function gen_random_uuid() {
	return sql`gen_random_uuid()`
}
