import { 
  users, warehouses, products, warehouseStock, customers, orders, orderItems, stockMovements, whatsappLogs,
  grns, grnItems,
  whatsappConversations, whatsappMessages,
  type User, type InsertUser, type Warehouse, type InsertWarehouse, 
  type Product, type InsertProduct, type Customer, type InsertCustomer,
  type Order, type InsertOrder, type OrderItem, type InsertOrderItem,
  type StockMovement, type InsertStockMovement, type WhatsappLog, type InsertWhatsappLog,
  type Grn, type InsertGrn, type GrnItem, type InsertGrnItem,
  type WhatsappConversation, type InsertWhatsappConversation, type WhatsappMessage, type InsertWhatsappMessage
} from "@shared/schema";
// Define RBAC table references directly
const permissions = {
  id: 'id',
  name: 'name',
  resource: 'resource', 
  action: 'action'
};
const rolePermissions = {
  role: 'role',
  permissionId: 'permission_id'
};
import { db } from "./db";
import { purchases, poDrafts } from "../shared/schema";
import { eq, desc, asc, like, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;

  // Warehouses
  getWarehouses(): Promise<Warehouse[]>;
  getWarehouse(id: string): Promise<Warehouse | undefined>;
  createWarehouse(warehouse: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: string, warehouse: Partial<InsertWarehouse>): Promise<Warehouse>;

  // Products
  getProducts(filters?: { search?: string; category?: string; warehouseId?: string }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductBySku(sku: string): Promise<Product | undefined>;
  searchProducts(query: string): Promise<Product[]>;
  searchProductsFuzzy(query: string): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  // Warehouse Stock
  getWarehouseStockForProduct(productId: string): Promise<any[]>;
  updateWarehouseStock(productId: string, warehouseId: string, quantity: number, location?: any): Promise<void>;

  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;

  // Orders
  getOrders(filters?: {
    status?: string;
    approvalStatus?: string;
    customer?: string; // customer name (partial match)
    dateFrom?: string | Date;
    dateTo?: string | Date;
    minTotal?: string | number;
    maxTotal?: string | number;
    sortBy?: "createdAt" | "total" | "status" | "approvalStatus" | "customer";
    sortDir?: "asc" | "desc";
  }): Promise<any[]>;
  getOrder(id: string): Promise<any | undefined>;
  createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order>;
  // Approval & GRN
  upsertOrderApprovalWithGrn(orderId: string, header: Omit<InsertGrn, "orderId">, items: InsertGrnItem[], requestedBy?: string, notes?: string): Promise<{ grn: Grn }>;
  // Request approval without GRN (for out-of-stock cases)
  requestApproval(orderId: string, requestedBy?: string, notes?: string): Promise<Order>;
  approveOrder(orderId: string, approvedBy: string, notes?: string): Promise<Order>;
  getOrderGrn(orderId: string): Promise<{ grn: Grn | undefined; items: GrnItem[] }>;
  // Product usage by orders
  getOrdersByProduct(productId: string): Promise<any[]>;

  // Stock Movements
  getStockMovements(productId?: string): Promise<any[]>;
  createStockMovement(movement: InsertStockMovement): Promise<StockMovement>;

  // WhatsApp Logs
  getWhatsappLogs(): Promise<WhatsappLog[]>;
  createWhatsappLog(log: InsertWhatsappLog): Promise<WhatsappLog>;

  // WhatsApp Conversations & Messages
  getOrCreateConversation(userPhone: string): Promise<WhatsappConversation>;
  getConversationByPhone(userPhone: string): Promise<WhatsappConversation | undefined>;
  getConversation(conversationId: string): Promise<WhatsappConversation | undefined>;
  updateConversation(id: string, data: Partial<InsertWhatsappConversation>): Promise<WhatsappConversation>;
  addWhatsappMessage(msg: InsertWhatsappMessage): Promise<WhatsappMessage>;
  listConversations(): Promise<WhatsappConversation[]>;
  listMessages(conversationId: string): Promise<WhatsappMessage[]>;

  // Analytics
  getDashboardStats(): Promise<any>;
  getLowStockProducts(): Promise<Product[]>;

  // Permissions and Roles
  initializePermissions(): Promise<void>;
  getUserPermissions(userId: string): Promise<string[]>;
  hasPermission(userId: string, resource: string, action: string): Promise<boolean>;

  // Purchases
  createPurchase(purchase: {
    userId: string;
    items: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    totalAmount: number;
    status: 'pending' | 'confirmed' | 'cancelled';
    invoiceImageUrl?: string | null;
    notes?: string;
  }): Promise<any>;
  getPurchases(userId?: string): Promise<any[]>;
  updatePurchase(id: string, updates: Partial<any>): Promise<any | null>;

  // PO Drafts
  getPoDraft(orderId: string): Promise<any | undefined>;
  upsertPoDraft(orderId: string, draft: { header?: any; items?: any[] }): Promise<any>;
  deletePoDraft(orderId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async requestApproval(orderId: string, requestedBy?: string, notes?: string): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({
        status: "needs_approval",
        approvalStatus: "needs_approval",
        approvalRequestedAt: new Date(),
        approvalRequestedBy: requestedBy,
        approvalNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  async getOrdersByProduct(productId: string): Promise<any[]> {
    // Return list of orders that include the product with item details and customer
    const items = await db
      .select({
        order: orders,
        customer: customers,
        orderItem: orderItems,
      })
      .from(orderItems)
      .leftJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orderItems.productId, productId))
      .orderBy(desc(orders.createdAt));

    return items;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updateUser: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updateUser)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getWarehouses(): Promise<Warehouse[]> {
    return await db.select().from(warehouses).where(eq(warehouses.isActive, true));
  }

  async getWarehouse(id: string): Promise<Warehouse | undefined> {
    const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return warehouse || undefined;
  }

  async createWarehouse(insertWarehouse: InsertWarehouse): Promise<Warehouse> {
    const [warehouse] = await db
      .insert(warehouses)
      .values(insertWarehouse)
      .returning();
    return warehouse;
  }

  async updateWarehouse(id: string, updateWarehouse: Partial<InsertWarehouse>): Promise<Warehouse> {
    const [warehouse] = await db
      .update(warehouses)
      .set(updateWarehouse)
      .where(eq(warehouses.id, id))
      .returning();
    return warehouse;
  }

  async getProducts(filters?: { search?: string; category?: string; warehouseId?: string }): Promise<Product[]> {
    const conditions = [eq(products.isActive, true)];
    
    if (filters?.search) {
      conditions.push(like(products.name, `%${filters.search}%`));
    }
    
    if (filters?.category) {
      conditions.push(eq(products.type, filters.category));
    }

    return await db
      .select()
      .from(products)
      .where(and(...conditions))
      .orderBy(asc(products.name));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product || undefined;
  }

  async getProductBySku(sku: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.sku, sku));
    return product || undefined;
  }

  async searchProducts(query: string): Promise<Product[]> {
    // First try exact match
    const [exactMatch] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`LOWER(${products.name}) = LOWER(${query})`
        )
      );
    
    if (exactMatch) {
      return [exactMatch];
    }

    // Try pattern match using LIKE
    return await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          sql`(
            LOWER(${products.name}) LIKE LOWER(${'%' + query + '%'}) OR
            LOWER(${products.sku}) LIKE LOWER(${'%' + query + '%'})
          )`
        )
      )
      .orderBy(asc(products.name))
      .limit(5);
  }

  async searchProductsFuzzy(query: string): Promise<Product[]> {
    // Normalize the query by removing special characters and converting to lowercase
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    // Get all active products
    const allProducts = await db
      .select()
      .from(products)
      .where(eq(products.isActive, true));
    
    // Calculate similarity scores and filter products
    const scoredProducts = allProducts.map(product => {
      const normalizedName = product.name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const normalizedSku = product.sku.toLowerCase();
      
      // Check for partial matches in name and SKU
      const nameMatch = normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
      const skuMatch = normalizedSku.includes(normalizedQuery) || normalizedQuery.includes(normalizedSku);
      
      // Calculate Levenshtein distance for name
      const nameDistance = this.levenshteinDistance(normalizedQuery, normalizedName);
      const nameScore = 1 - (nameDistance / Math.max(normalizedQuery.length, normalizedName.length));
      
      // Calculate final score (higher is better)
      const score = nameMatch ? 0.8 : (skuMatch ? 0.7 : nameScore);
      
      return { product, score };
    });
    
    // Sort by score (descending) and filter out low scores
    return scoredProducts
      .filter(item => item.score > 0.3) // Adjust threshold as needed
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);
  }
  
  // Helper method to calculate Levenshtein distance between two strings
  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    
    for (let i = 0; i <= a.length; i++) {
      matrix[0][i] = i;
    }
    
    for (let j = 0; j <= b.length; j++) {
      matrix[j][0] = j;
    }
    
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }
    
    return matrix[b.length][a.length];
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db
      .insert(products)
      .values({
        ...insertProduct,
        stockAvailable: insertProduct.stockTotal || 0,
      })
      .returning();
    return product;
  }

  async updateProduct(id: string, updateProduct: Partial<InsertProduct>): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({
        ...updateProduct,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.update(products)
      .set({ isActive: false })
      .where(eq(products.id, id));
  }

  async getWarehouseStockForProduct(productId: string): Promise<any[]> {
    return await db
      .select({
        warehouseStock,
        warehouse: warehouses,
      })
      .from(warehouseStock)
      .leftJoin(warehouses, eq(warehouseStock.warehouseId, warehouses.id))
      .where(eq(warehouseStock.productId, productId));
  }

  async updateWarehouseStock(productId: string, warehouseId: string, quantity: number, location?: any): Promise<void> {
    const existing = await db
      .select()
      .from(warehouseStock)
      .where(and(
        eq(warehouseStock.productId, productId),
        eq(warehouseStock.warehouseId, warehouseId)
      ));

    if (existing.length > 0) {
      await db
        .update(warehouseStock)
        .set({ 
          quantity,
          aisle: location?.aisle,
          rack: location?.rack,
          boxNumber: location?.boxNumber,
          updatedAt: new Date()
        })
        .where(and(
          eq(warehouseStock.productId, productId),
          eq(warehouseStock.warehouseId, warehouseId)
        ));
    } else {
      await db.insert(warehouseStock).values({
        productId,
        warehouseId,
        quantity,
        aisle: location?.aisle,
        rack: location?.rack,
        boxNumber: location?.boxNumber,
      });
    }
  }

  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(asc(customers.name));
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer || undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async getOrders(filters?: {
    status?: string;
    approvalStatus?: string;
    customer?: string;
    dateFrom?: string | Date;
    dateTo?: string | Date;
    minTotal?: string | number;
    maxTotal?: string | number;
    sortBy?: "createdAt" | "total" | "status" | "approvalStatus" | "customer";
    sortDir?: "asc" | "desc";
  }): Promise<any[]> {
    const conditions: any[] = [];

    if (filters?.status) {
      conditions.push(eq(orders.status, filters.status));
    }
    if (filters?.approvalStatus) {
      conditions.push(eq(orders.approvalStatus, filters.approvalStatus));
    }
    if (filters?.customer) {
      // case-insensitive partial match on customer name
      conditions.push(like(orders.customerName, `%${filters.customer}%`));
    }
    if (filters?.dateFrom) {
      const df = typeof filters.dateFrom === "string" ? new Date(filters.dateFrom) : filters.dateFrom;
      conditions.push(sql`${orders.createdAt} >= ${df}`);
    }
    if (filters?.dateTo) {
      const dt = typeof filters.dateTo === "string" ? new Date(filters.dateTo) : filters.dateTo;
      conditions.push(sql`${orders.createdAt} <= ${dt}`);
    }
    if (filters?.minTotal != null && filters.minTotal !== "") {
      const minT = typeof filters.minTotal === "string" ? Number(filters.minTotal) : filters.minTotal;
      conditions.push(sql`CAST(${orders.total} AS NUMERIC) >= ${minT}`);
    }
    if (filters?.maxTotal != null && filters.maxTotal !== "") {
      const maxT = typeof filters.maxTotal === "string" ? Number(filters.maxTotal) : filters.maxTotal;
      conditions.push(sql`CAST(${orders.total} AS NUMERIC) <= ${maxT}`);
    }

    const query = db
      .select({
        order: orders,
        customer: customers,
        itemCount: sql<number>`count(${orderItems.id})`.as('itemCount'),
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(orderItems, eq(orders.id, orderItems.orderId))
      .groupBy(orders.id, customers.id);

    // Sorting
    const sortBy = filters?.sortBy ?? "createdAt";
    const sortDir = (filters?.sortDir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const orderExpr = (() => {
      switch (sortBy) {
        case "total":
          return sortDir === "asc" ? asc(orders.total) : desc(orders.total);
        case "status":
          return sortDir === "asc" ? asc(orders.status) : desc(orders.status);
        case "approvalStatus":
          return sortDir === "asc" ? asc(orders.approvalStatus) : desc(orders.approvalStatus);
        case "customer":
          return sortDir === "asc" ? asc(orders.customerName) : desc(orders.customerName);
        case "createdAt":
        default:
          return sortDir === "asc" ? asc(orders.createdAt) : desc(orders.createdAt);
      }
    })();

    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(orderExpr);
    }

    return await query.orderBy(orderExpr);
  }

  async getOrder(id: string): Promise<any | undefined> {
    const [orderData] = await db
      .select({
        order: orders,
        customer: customers,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.id, id));

    if (!orderData) return undefined;

    const items = await db
      .select({
        orderItem: orderItems,
        product: products,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, id));

    return {
      ...orderData.order,
      customer: orderData.customer,
      items,
    };
  }

  async createOrder(insertOrder: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const orderNumber = `ORD-${Date.now()}`;
    
    const [order] = await db
      .insert(orders)
      .values({
        ...insertOrder,
        orderNumber,
      })
      .returning();

    // Insert order items
    if (items.length > 0) {
      await db.insert(orderItems).values(
        items.map(item => ({
          ...item,
          orderId: order.id,
        }))
      );

      // Update stock, create movement logs, and detect out-of-stock usage
      let needsApproval = false;
      for (const item of items) {
        const product = await this.getProduct(item.productId);
        if (product) {
          // If current available is less than requested, flag for approval
          if ((product.stockAvailable ?? 0) < item.quantity) {
            needsApproval = true;
          }

          const newStockUsed = product.stockUsed + item.quantity;
          const newStockAvailable = product.stockTotal - newStockUsed;

          await this.updateProduct(item.productId, {
            stockUsed: newStockUsed,
            stockAvailable: newStockAvailable,
          });

          await this.createStockMovement({
            productId: item.productId,
            action: "use",
            quantity: -item.quantity,
            previousStock: product.stockAvailable,
            newStock: newStockAvailable,
            reason: `Used for order ${orderNumber}`,
            orderId: order.id,
          });
        }
      }

      if (needsApproval) {
        // Mark order as needing approval with metadata
        await db
          .update(orders)
          .set({
            status: "needs_approval",
            approvalStatus: "needs_approval",
            approvalRequestedAt: new Date(),
            approvalRequestedBy: insertOrder?.customerName || "system",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
      }
    }

    return order;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return order;
  }

  async upsertOrderApprovalWithGrn(orderId: string, header: Omit<InsertGrn, "orderId">, items: InsertGrnItem[], requestedBy?: string, notes?: string): Promise<{ grn: Grn }> {
    // Upsert GRN header (one GRN per order). If exists, update; else insert.
    const existing = await db.select().from(grns).where(eq(grns.orderId, orderId));
    let grnRow: Grn;
    if (existing[0]) {
      const [updated] = await db
        .update(grns)
        .set({ ...header })
        .where(eq(grns.id, existing[0].id))
        .returning();
      grnRow = updated as Grn;
      // Replace items: delete then insert
      await db.delete(grnItems).where(eq(grnItems.grnId, grnRow.id));
    } else {
      const [created] = await db
        .insert(grns)
        .values({ ...header, orderId })
        .returning();
      grnRow = created as Grn;
    }

    if (items && items.length) {
      await db.insert(grnItems).values(items.map(it => ({ ...it, grnId: grnRow.id })));
    }

    // Move order into needs_approval and set metadata
    await db
      .update(orders)
      .set({ 
        status: "needs_approval",
        approvalStatus: "needs_approval",
        approvalRequestedAt: new Date(),
        approvalRequestedBy: requestedBy,
        approvalNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    return { grn: grnRow };
  }

  async approveOrder(orderId: string, approvedBy: string, notes?: string): Promise<Order> {
    const [order] = await db
      .update(orders)
      .set({ 
        status: "approved",
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy,
        approvalNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return order;
  }

  async getOrderGrn(orderId: string): Promise<{ grn: Grn | undefined; items: GrnItem[] }> {
    const [grnRow] = await db.select().from(grns).where(eq(grns.orderId, orderId));
    if (!grnRow) return { grn: undefined, items: [] };
    const items = await db.select().from(grnItems).where(eq(grnItems.grnId, grnRow.id));
    return { grn: grnRow, items };
  }

  async getStockMovements(productId?: string): Promise<any[]> {
    const query = db
      .select({
        movement: stockMovements,
        product: products,
        warehouse: warehouses,
        user: users,
      })
      .from(stockMovements)
      .leftJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
      .leftJoin(users, eq(stockMovements.userId, users.id));

    if (productId) {
      return await query.where(eq(stockMovements.productId, productId)).orderBy(desc(stockMovements.createdAt));
    }

    return await query.orderBy(desc(stockMovements.createdAt));
  }

  async createStockMovement(insertMovement: InsertStockMovement): Promise<StockMovement> {
    const [movement] = await db
      .insert(stockMovements)
      .values(insertMovement)
      .returning();
    return movement;
  }

  async getWhatsappLogs(): Promise<WhatsappLog[]> {
    return await db.select().from(whatsappLogs).orderBy(desc(whatsappLogs.createdAt));
  }

  async createWhatsappLog(insertLog: InsertWhatsappLog): Promise<WhatsappLog> {
    const [log] = await db
      .insert(whatsappLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async getOrCreateConversation(userPhone: string): Promise<WhatsappConversation> {
    const existing = await this.getConversationByPhone(userPhone);
    if (existing) return existing;
    const [created] = await db.insert(whatsappConversations).values({ userPhone }).returning();
    return created;
  }

  async getConversationByPhone(userPhone: string): Promise<WhatsappConversation | undefined> {
    const [row] = await db.select().from(whatsappConversations).where(eq(whatsappConversations.userPhone, userPhone));
    return row || undefined;
  }

  async getConversation(conversationId: string): Promise<WhatsappConversation | undefined> {
    const [row] = await db.select().from(whatsappConversations).where(eq(whatsappConversations.id, conversationId));
    return row || undefined;
  }

  async updateConversation(id: string, data: Partial<InsertWhatsappConversation>): Promise<WhatsappConversation> {
    const [row] = await db
      .update(whatsappConversations)
      .set({ ...data, updatedAt: new Date() as any })
      .where(eq(whatsappConversations.id, id))
      .returning();
    return row;
  }

  async addWhatsappMessage(msg: InsertWhatsappMessage): Promise<WhatsappMessage> {
    const [row] = await db.insert(whatsappMessages).values(msg).returning();
    return row;
  }

  async listConversations(): Promise<WhatsappConversation[]> {
    return await db.select().from(whatsappConversations).orderBy(desc(whatsappConversations.updatedAt));
  }

  async listMessages(conversationId: string): Promise<WhatsappMessage[]> {
    return await db
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.conversationId, conversationId))
      .orderBy(asc(whatsappMessages.createdAt));
  }

  async getDashboardStats(): Promise<any> {
    const [productStats] = await db
      .select({
        totalProducts: sql<number>`count(*)`,
        lowStockCount: sql<number>`count(*) filter (where ${products.stockAvailable} <= ${products.minStockLevel})`,
      })
      .from(products)
      .where(eq(products.isActive, true));

    const [orderStats] = await db
      .select({
        totalOrders: sql<number>`count(*)`,
        pendingOrders: sql<number>`count(*) filter (where ${orders.status} = 'pending')`,
      })
      .from(orders);

    const [warehouseCount] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(warehouses)
      .where(eq(warehouses.isActive, true));

    return {
      totalProducts: productStats?.totalProducts || 0,
      lowStockCount: productStats?.lowStockCount || 0,
      totalOrders: orderStats?.totalOrders || 0,
      pendingOrders: orderStats?.pendingOrders || 0,
      warehouseCount: warehouseCount?.count || 0,
    };
  }

  async getLowStockProducts(): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(and(
        eq(products.isActive, true),
        sql`${products.stockAvailable} <= ${products.minStockLevel}`
      ))
      .orderBy(asc(products.stockAvailable));
  }

  async initializePermissions(): Promise<void> {
    try {
      // Check if permissions table exists and has data
      const result = await db.execute(sql`SELECT COUNT(*) as count FROM permissions`);
      const count = result.rows[0]?.count || 0;
      
      if (count > 0) {
        console.log('Permissions already initialized');
        return;
      }
      
      console.log('Permissions table empty or missing - please run setup script');
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.getUser(userId);
    if (!user) return [];

    const result = await db.execute(sql`
      SELECT p.name
      FROM role_permissions rp
      INNER JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role = ${user.role}
    `);

    return result.rows.map((row: any) => row.name);
  }

  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) return false;
    
    if (user.role === 'admin') return true; // Admin has all permissions

    const result = await db.execute(sql`
      SELECT 1
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE p.resource = ${resource}
        AND p.action = ${action}
        AND rp.role = ${user.role}
    `);

    return result.rows.length > 0;
  }

  private generateId(): string {
    return uuidv4();
  }

  async createPurchase(purchase: {
    userId: string;
    items: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    totalAmount: number;
    status: 'pending' | 'confirmed' | 'cancelled';
    invoiceImageUrl?: string | null;
    notes?: string;
  }): Promise<any> {
    const id = this.generateId();
    const timestamp = new Date();
    const itemsJson = JSON.stringify(purchase.items);
    const [newPurchase] = await db.insert(purchases).values({
      id,
      userId: purchase.userId,
      items: itemsJson,
      totalAmount: purchase.totalAmount,
      status: purchase.status,
      invoiceImageUrl: purchase.invoiceImageUrl,
      notes: purchase.notes,
      timestamp
    }).returning();
    return newPurchase;
  }

  async getPurchases(userId?: string): Promise<any[]> {
    let query = db.select().from(purchases);
    if (userId) {
      query = query.where(eq(purchases.userId, userId));
    }
    const all = await query.orderBy(desc(purchases.timestamp));
    return all;
  }

  async updatePurchase(id: string, updates: Partial<any>): Promise<any | null> {
    const [updated] = await db.update(purchases)
      .set(updates)
      .where(eq(purchases.id, id))
      .returning();
    return updated || null;
  }

  // ==== PO Drafts ====
  async getPoDraft(orderId: string): Promise<any | undefined> {
    const [row] = await db.select().from(poDrafts).where(eq(poDrafts.orderId, orderId));
    return row || undefined;
  }

  async upsertPoDraft(orderId: string, draft: { header?: any; items?: any[] }): Promise<any> {
    const existing = await this.getPoDraft(orderId);
    if (existing) {
      const [updated] = await db
        .update(poDrafts)
        .set({ header: draft.header as any, items: draft.items as any, updatedAt: new Date() as any })
        .where(eq(poDrafts.orderId, orderId))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(poDrafts)
      .values({ orderId, header: draft.header as any, items: draft.items as any })
      .returning();
    return created;
  }

  async deletePoDraft(orderId: string): Promise<void> {
    await db.delete(poDrafts).where(eq(poDrafts.orderId, orderId));
  }
}

export const storage = new DatabaseStorage();
