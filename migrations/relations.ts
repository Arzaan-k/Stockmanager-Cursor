import { relations } from "drizzle-orm/relations";
import { customers, orders, orderItems, products, stockMovements, warehouses, users, warehouseStock, whatsappLogs, whatsappConversations, whatsappMessages } from "./schema";

export const ordersRelations = relations(orders, ({one, many}) => ({
	customer: one(customers, {
		fields: [orders.customerId],
		references: [customers.id]
	}),
	orderItems: many(orderItems),
	stockMovements: many(stockMovements),
}));

export const customersRelations = relations(customers, ({many}) => ({
	orders: many(orders),
}));

export const orderItemsRelations = relations(orderItems, ({one}) => ({
	order: one(orders, {
		fields: [orderItems.orderId],
		references: [orders.id]
	}),
	product: one(products, {
		fields: [orderItems.productId],
		references: [products.id]
	}),
}));

export const productsRelations = relations(products, ({many}) => ({
	orderItems: many(orderItems),
	stockMovements: many(stockMovements),
	warehouseStocks: many(warehouseStock),
	whatsappLogs: many(whatsappLogs),
}));

export const stockMovementsRelations = relations(stockMovements, ({one}) => ({
	product: one(products, {
		fields: [stockMovements.productId],
		references: [products.id]
	}),
	warehouse: one(warehouses, {
		fields: [stockMovements.warehouseId],
		references: [warehouses.id]
	}),
	user: one(users, {
		fields: [stockMovements.userId],
		references: [users.id]
	}),
	order: one(orders, {
		fields: [stockMovements.orderId],
		references: [orders.id]
	}),
}));

export const warehousesRelations = relations(warehouses, ({many}) => ({
	stockMovements: many(stockMovements),
	warehouseStocks: many(warehouseStock),
}));

export const usersRelations = relations(users, ({many}) => ({
	stockMovements: many(stockMovements),
	whatsappConversations: many(whatsappConversations),
}));

export const warehouseStockRelations = relations(warehouseStock, ({one}) => ({
	product: one(products, {
		fields: [warehouseStock.productId],
		references: [products.id]
	}),
	warehouse: one(warehouses, {
		fields: [warehouseStock.warehouseId],
		references: [warehouses.id]
	}),
}));

export const whatsappLogsRelations = relations(whatsappLogs, ({one}) => ({
	product: one(products, {
		fields: [whatsappLogs.productId],
		references: [products.id]
	}),
}));

export const whatsappConversationsRelations = relations(whatsappConversations, ({one, many}) => ({
	assignedTo: one(users, {
		fields: [whatsappConversations.assignedToUserId],
		references: [users.id]
	}),
	messages: many(whatsappMessages),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({one}) => ({
	conversation: one(whatsappConversations, {
		fields: [whatsappMessages.conversationId],
		references: [whatsappConversations.id]
	}),
}));