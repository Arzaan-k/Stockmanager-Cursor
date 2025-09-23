import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { whatsappService } from "./services/whatsapp";
import { enhancedWhatsAppService } from "./services/whatsapp-enhanced";
import { parseInventoryCommand } from "./services/gemini";
import { z } from "zod";
import { insertProductSchema, insertOrderSchema, insertOrderItemSchema, insertCustomerSchema, insertWarehouseSchema, users } from "@shared/schema";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { streamPurchaseOrderPdf } from "./services/po";
import { registerVendorRoutes } from "./routes/vendors";
import { registerEmployeeRoutes } from "./routes/employee";
import { authenticate, authorize, AuthenticatedRequest } from "./auth/middleware";
import { imageRecognitionService } from "./services/image-recognition";
import { productImageManager } from "./services/product-image-manager";
import { databaseImageStorage } from "./services/database-image-storage";
import multer from "multer";
import * as fs from 'fs';
import * as path from 'path';

// Configure multer for image uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Helper to normalize image URLs stored with localhost into relative paths
  const normalizeImageUrl = (url?: string | null): string | null => {
    if (!url) return url ?? null;
    try {
      const u = new URL(url);
      if (u.pathname.startsWith('/uploads/')) return u.pathname;
      return url;
    } catch {
      // Not a URL; if already relative keep as is
      return url;
    }
  };
  // Register vendor routes
  registerVendorRoutes(app);
  
  // Register employee routes
  registerEmployeeRoutes(app);
  
  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      console.log("/api/auth/login attempt", { username, found: !!user });
      
      if (!user || user.password !== password) {
        console.log("/api/auth/login failed", { username, reason: !user ? "user_not_found" : "password_mismatch" });
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(401).json({ error: "Account is inactive" });
      }

      // Get user permissions
      const permissions = await storage.getUserPermissions(user.id);

      const userResponse = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        permissions
      };

      // For development, use mock token; in production, use proper JWT
      const token = process.env.NODE_ENV === 'production'
        ? jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
          )
        : "mock-jwt-token";
      
      res.json({ user: userResponse, token });
    } catch (error) {
      console.error("/api/auth/login error", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // User registration (admin only)
  app.post("/api/auth/register", authenticate, authorize('users', 'create'), async (req: AuthenticatedRequest, res) => {
    try {
      const { username, email, password, role, firstName, lastName } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email, and password are required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const newUser = await storage.createUser({
        username,
        email,
        password, // In production, this should be hashed
        role: role || 'employee',
        firstName,
        lastName
      });

      res.status(201).json({
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          firstName: newUser.firstName,
          lastName: newUser.lastName
        },
        message: 'User created successfully'
      });
    } catch (error) {
      console.error("/api/auth/register error", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Employee self-registration (no authentication required)
  app.post("/api/auth/employee-register", async (req, res) => {
    try {
      const { name, email, mobile, password } = req.body;
      
      if (!name || !email || !mobile || !password) {
        return res.status(400).json({ error: "Name, email, mobile number, and password are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please provide a valid email address" });
      }

      // Validate mobile number (basic validation)
      const mobileRegex = /^[+]?[\d\s\-\(\)]{10,15}$/;
      if (!mobileRegex.test(mobile.replace(/\s/g, ''))) {
        return res.status(400).json({ error: "Please provide a valid mobile number" });
      }

      // Check if user already exists (email, mobile, or username)
      const existingUserByEmail = await storage.getUserByUsername(email); // We can check by email too
      const existingUsers = await db.select().from(users).where(
        sql`${users.email} = ${email} OR ${users.mobile} = ${mobile}`
      );
      
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: "An account with this email or mobile number already exists" });
      }

      // Extract first name and last name from name
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      
      // Generate username from email (part before @)
      const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Check if username exists, if so, add a number
      let finalUsername = username;
      let counter = 1;
      while (await storage.getUserByUsername(finalUsername)) {
        finalUsername = `${username}${counter}`;
        counter++;
      }

      const newUser = await storage.createUser({
        username: finalUsername,
        email,
        mobile,
        password, // In production, this should be hashed
        role: 'employee', // Default role for self-registration
        firstName,
        lastName
      });

      res.status(201).json({
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          mobile: newUser.mobile,
          role: newUser.role,
          firstName: newUser.firstName,
          lastName: newUser.lastName
        },
        message: 'Employee account created successfully. You can now login with your credentials.'
      });
    } catch (error) {
      console.error("/api/auth/employee-register error", error);
      if (error.message && error.message.includes('duplicate key')) {
        return res.status(400).json({ error: "An account with these details already exists" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Get current user info
  app.get("/api/auth/me", authenticate, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const permissions = await storage.getUserPermissions(req.user.id);
      
      res.json({
        user: req.user,
        permissions
      });
    } catch (error) {
      console.error("/api/auth/me error", error);
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });

  // CSV import for products
  app.post("/api/products/import-csv", async (req, res) => {
    try {
      const { csv, warehouseId } = req.body || {};
      if (typeof csv !== "string" || csv.trim().length === 0) {
        return res.status(400).json({ error: "CSV content is required" });
      }

      // Basic CSV parser supporting quoted values and commas
      const parseCSV = (text: string): string[][] => {
        const rows: string[][] = [];
        let row: string[] = [];
        let cell = "";
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
          const c = text[i];
          const next = text[i + 1];
          if (c === '"') {
            if (inQuotes && next === '"') { // escaped quote
              cell += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (c === "," && !inQuotes) {
            row.push(cell.trim());
            cell = "";
          } else if ((c === "\n" || c === "\r") && !inQuotes) {
            if (cell.length > 0 || row.length > 0) {
              row.push(cell.trim());
              rows.push(row);
              row = [];
              cell = "";
            }
            // skip \r in \r\n
            if (c === "\r" && next === "\n") i++;
          } else {
            cell += c;
          }
        }
        if (cell.length > 0 || row.length > 0) {
          row.push(cell.trim());
          rows.push(row);
        }
        return rows.filter(r => r.some(v => v !== ""));
      };

      const rows = parseCSV(csv);
      if (rows.length === 0) return res.json({ imported: 0 });

      const header = rows[0].map(h => h.toLowerCase().trim());
      const dataRows = rows.slice(1);

      const get = (colName: string, r: string[]): string | undefined => {
        const idx = header.indexOf(colName.toLowerCase());
        return idx >= 0 ? r[idx] : undefined;
      };

      let imported = 0;
      const created: any[] = [];
      for (const r of dataRows) {
        // Map incoming columns to product fields
        const listOfItems = get("list of items", r) ?? get("name", r);
        const crystalPartCode = get("crystal part code", r) ?? get("sku", r);
        const mfgPartCode = get("mfg part code", r);
        const priceStr = get("price", r);
        const currentStockStr = get("current stock available", r) ?? get("stock", r);

        const productCandidate: any = {
          name: listOfItems || crystalPartCode || mfgPartCode || "Unnamed Product",
          description: get("description", r),
          sku: crystalPartCode || mfgPartCode || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: get("group name", r) || get("type", r) || "General",
          price: priceStr && priceStr !== "" ? priceStr : undefined,
          stockTotal: currentStockStr ? parseInt(currentStockStr) || 0 : 0,
          minStockLevel: parseInt(get("minimum inventory per day", r) || "0") || 0,
          imageUrl: get("image url", r),
          groupCode: get("group code", r),
          groupName: get("group name", r),
          crystalPartCode,
          listOfItems,
          photos: (() => {
            const p = get("photos", r);
            if (!p) return null;
            const parts = p.split(/[;|,\s]+/).filter(Boolean);
            return parts.length ? parts : null;
          })(),
          mfgPartCode,
          importance: get("importance", r),
          highValue: get("high value", r),
          maximumUsagePerMonth: parseInt(get("maximum usage per month", r) || "") || undefined,
          sixMonthsUsage: parseInt(get("6 months usage", r) || get("six months usage", r) || "") || undefined,
          averagePerDay: (() => {
            const v = get("average per day", r);
            if (!v) return undefined;
            return v;
          })(),
          leadTimeDays: parseInt(get("lead time days", r) || "") || undefined,
          criticalFactorOneDay: parseInt(get("critical factor - one day", r) || "") || undefined,
          units: get("units", r),
          minimumInventoryPerDay: parseInt(get("minimum inventory per day", r) || "") || undefined,
          maximumInventoryPerDay: parseInt(get("maximum inventory per day", r) || "") || undefined,
        };

        try {
          const validated = insertProductSchema.parse(productCandidate);
          const createdProduct = await storage.createProduct(validated);
          // Optionally set initial warehouse stock
          if (typeof warehouseId === "string" && warehouseId && createdProduct.stockTotal > 0) {
            await storage.updateWarehouseStock(createdProduct.id, warehouseId, createdProduct.stockTotal);
          }
          created.push(createdProduct);
          imported++;
        } catch (e) {
          // skip invalid rows
          continue;
        }
      }

      res.json({ imported, products: created });
    } catch (error) {
      console.error("/api/products/import-csv error", error);
      res.status(500).json({ error: "Failed to import products from CSV" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Recent stock movements for dashboard
  app.get("/api/dashboard/recent-movements", async (req, res) => {
    try {
      const movements = await storage.getStockMovements();
      res.json(movements.slice(0, 10)); // Last 10 movements
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent movements" });
    }
  });

  // Low stock products
  app.get("/api/dashboard/low-stock", async (req, res) => {
    try {
      const lowStockProducts = await storage.getLowStockProducts();
      res.json(lowStockProducts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch low stock products" });
    }
  });

  // Products routes
  app.get("/api/products", async (req, res) => {
    try {
      const { search, category, warehouseId } = req.query;
      let products = await storage.getProducts({
        search: search as string,
        category: category as string,
        warehouseId: warehouseId as string,
      });
      // Normalize image urls (strip localhost hostnames) and fallback to first photo
      products = products.map(p => {
        const anyP: any = p as any;
        let imageUrl = normalizeImageUrl(anyP.imageUrl) as string | null;
        if (!imageUrl && Array.isArray(anyP.photos) && anyP.photos.length > 0) {
          const first = anyP.photos[0];
          const firstUrl = typeof first === 'string' ? first : first?.url;
          imageUrl = normalizeImageUrl(firstUrl) as string | null;
        }
        return { ...p, imageUrl } as any;
      });
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const id = req.params.id;
      console.log("GET /api/products/:id", { id });
      const product = await storage.getProduct(id);
      if (!product) {
        console.warn("GET /api/products/:id not found", { id });
        return res.status(404).json({ error: "Product not found" });
      }
      const normalized: any = { ...product, imageUrl: normalizeImageUrl((product as any).imageUrl) };
      if (!normalized.imageUrl && Array.isArray((product as any).photos) && (product as any).photos.length > 0) {
        const first = (product as any).photos[0];
        const firstUrl = typeof first === 'string' ? first : first?.url;
        normalized.imageUrl = normalizeImageUrl(firstUrl);
      }
      if ((product as any).photos && Array.isArray((product as any).photos)) {
        normalized.photos = (product as any).photos.map((ph: any) => {
          if (typeof ph === 'string') return normalizeImageUrl(ph);
          if (ph && typeof ph === 'object') return { ...ph, url: normalizeImageUrl(ph.url) };
          return ph;
        });
      }
      res.json(normalized);
    } catch (error) {
      console.error("GET /api/products/:id error", error);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  // Product usage details (stock, movements, orders)
  app.get("/api/products/:id/usage", async (req, res) => {
    try {
      const productId = req.params.id;
      console.log("GET /api/products/:id/usage", { productId });
      const product = await storage.getProduct(productId);
      if (!product) {
        console.warn("GET /api/products/:id/usage not found", { productId });
        return res.status(404).json({ error: "Product not found" });
      }

      const [warehouseStockList, movements, orders] = await Promise.all([
        storage.getWarehouseStockForProduct(productId),
        storage.getStockMovements(productId),
        storage.getOrdersByProduct(productId),
      ]);

      res.json({
        product,
        warehouseStock: warehouseStockList,
        movements,
        orders,
      });
    } catch (error) {
      console.error("GET /api/products/:id/usage error", error);
      res.status(500).json({ error: "Failed to fetch product usage info" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      // Accept optional warehouseId separate from product fields
      const { warehouseId, ...body } = req.body || {};
      const productData = insertProductSchema.parse(body);

      const product = await storage.createProduct(productData);

      // If warehouseId provided, set initial stock in warehouse_stock
      if (typeof warehouseId === "string" && warehouseId) {
        const qty = Number(productData.stockTotal) || 0;
        if (qty > 0) {
          await storage.updateWarehouseStock(product.id, warehouseId, qty);
        }
      }

      res.status(201).json(product);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid product data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.put("/api/products/:id", async (req, res) => {
    try {
      const productData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(req.params.id, productData);
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // Stock update route
  app.post("/api/products/:id/stock", async (req, res) => {
    try {
      const { action, quantity, warehouseId, reason, userId } = req.body;
      const product = await storage.getProduct(req.params.id);
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      let newStockTotal = product.stockTotal;
      let newStockUsed = product.stockUsed;
      let newStockAvailable = product.stockAvailable;

      if (action === "add") {
        newStockTotal += quantity;
        newStockAvailable += quantity;
      } else if (action === "use") {
        newStockUsed += quantity;
        newStockAvailable -= quantity;
      } else if (action === "adjust") {
        newStockTotal = quantity;
        newStockAvailable = newStockTotal - newStockUsed;
      }

      await storage.updateProduct(req.params.id, {
        stockTotal: newStockTotal,
        stockUsed: newStockUsed,
        stockAvailable: newStockAvailable,
      });

      await storage.createStockMovement({
        productId: req.params.id,
        warehouseId,
        action,
        quantity: action === "use" ? -quantity : quantity,
        previousStock: product.stockAvailable,
        newStock: newStockAvailable,
        reason,
        userId,
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update stock" });
    }
  });

  // Warehouses routes
  app.get("/api/warehouses", async (req, res) => {
    try {
      const warehouses = await storage.getWarehouses();
      res.json(warehouses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch warehouses" });
    }
  });

  app.post("/api/warehouses", async (req, res) => {
    try {
      const warehouseData = insertWarehouseSchema.parse(req.body);
      const warehouse = await storage.createWarehouse(warehouseData);
      res.status(201).json(warehouse);
    } catch (error) {
      res.status(500).json({ error: "Failed to create warehouse" });
    }
  });

  // Orders routes
  app.get("/api/orders", async (req, res) => {
    try {
      const {
        status,
        approvalStatus,
        customer,
        dateFrom,
        dateTo,
        minTotal,
        maxTotal,
        sortBy,
        sortDir,
      } = req.query as Record<string, string>;

      const orders = await storage.getOrders({
        status,
        approvalStatus,
        customer,
        dateFrom,
        dateTo,
        minTotal,
        maxTotal,
        sortBy: sortBy as any,
        sortDir: sortDir as any,
      });
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Purchase Order PDF (out-of-stock items only)
  app.get("/api/orders/:id/po.pdf", async (req, res) => {
    try {
      await streamPurchaseOrderPdf(res, req.params.id, { download: false });
    } catch (error) {
      console.error("GET /api/orders/:id/po.pdf error", error);
      res.status(500).json({ error: "Failed to generate PO PDF" });
    }
  });

  app.get("/api/orders/:id/po.pdf/download", async (req, res) => {
    try {
      await streamPurchaseOrderPdf(res, req.params.id, { download: true });
    } catch (error) {
      console.error("GET /api/orders/:id/po.pdf/download error", error);
      res.status(500).json({ error: "Failed to download PO PDF" });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const { order: orderData, items } = req.body;
      
      const validatedOrder = insertOrderSchema.parse(orderData);
      const validatedItems = items.map((item: any) => insertOrderItemSchema.parse(item));

      // Create customer if doesn't exist
      let customer;
      if (orderData.customerEmail) {
        const customers = await storage.getCustomers();
        customer = customers.find(c => c.email === orderData.customerEmail);
        
        if (!customer && orderData.customerName) {
          customer = await storage.createCustomer({
            name: orderData.customerName,
            email: orderData.customerEmail,
            phone: orderData.customerPhone,
          });
        }
      }

      const order = await storage.createOrder({
        ...validatedOrder,
        customerId: customer?.id,
      }, validatedItems);
      
      res.status(201).json(order);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid order data", details: error.errors });
      }
      console.error("POST /api/orders error", {
        message: (error as any)?.message,
        code: (error as any)?.code,
        detail: (error as any)?.detail,
        stack: (error as any)?.stack,
      });
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.put("/api/orders/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      const order = await storage.updateOrderStatus(req.params.id, status);
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  // Approval workflow: request approval (with optional GRN). If no GRN/items provided, mark as needs_approval without GRN.
  app.post("/api/orders/:id/request-approval", async (req, res) => {
    try {
      const BodySchema = z.object({
        grn: z.object({
          vendorName: z.string().optional(),
          vendorBillNo: z.string().optional(),
          indentNo: z.string().optional(),
          poNo: z.string().optional(),
          challanNo: z.string().optional(),
          grnDate: z.string().datetime().or(z.string()).optional(),
          vendorBillDate: z.string().datetime().or(z.string()).optional(),
          poDate: z.string().datetime().or(z.string()).optional(),
          jobOrderNo: z.string().optional(),
          location: z.string().optional(),
          receivedBy: z.string().optional(),
          personName: z.string().optional(),
          remarks: z.string().optional(),
        }).optional(),
        items: z.array(z.object({
          srNo: z.number().optional(),
          mfgPartCode: z.string().optional(),
          requiredPart: z.string().optional(),
          makeModel: z.string().optional(),
          partNo: z.string().optional(),
          condition: z.string().optional(),
          qtyUnit: z.string().optional(),
          rate: z.number().or(z.string()).optional(),
          quantity: z.number().or(z.string()).optional(),
          amount: z.number().or(z.string()).optional(),
        })).optional(),
        notes: z.string().optional(),
        requestedBy: z.string().optional(),
      });
      const { grn, items, notes, requestedBy } = BodySchema.parse(req.body || {});

      const hasGrn = grn && Object.keys(grn).length > 0;
      const hasItems = Array.isArray(items) && items.length > 0;

      if (!hasGrn && !hasItems) {
        const order = await storage.requestApproval(req.params.id, requestedBy, notes);
        return res.json({ success: true, order });
      }

      const header = { ...(grn || {}) } as any;
      ["grnDate","vendorBillDate","poDate"].forEach(k => { if ((header as any)[k]) (header as any)[k] = new Date((header as any)[k]); });
      const result = await storage.upsertOrderApprovalWithGrn(req.params.id, header, (items || []) as any, requestedBy, notes);
      res.json({ success: true, grn: result.grn });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: error.errors });
      }
      console.error("POST /api/orders/:id/request-approval error", error);
      res.status(500).json({ error: "Failed to request approval" });
    }
  });

  // Approval workflow: approve
  app.post("/api/orders/:id/approve", async (req, res) => {
    try {
      const BodySchema = z.object({ approvedBy: z.string(), notes: z.string().optional() });
      const { approvedBy, notes } = BodySchema.parse(req.body || {});
      const order = await storage.approveOrder(req.params.id, approvedBy, notes);
      res.json({ success: true, order });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: error.errors });
      }
      res.status(500).json({ error: "Failed to approve order" });
    }
  });

  // Get GRN for an order
  app.get("/api/orders/:id/grn", async (req, res) => {
    try {
      const data = await storage.getOrderGrn(req.params.id);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch GRN" });
    }
  });

  // Customers routes
  app.get("/api/customers", async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  // WhatsApp webhook routes - use enhanced service for better conversation handling
  app.get("/api/whatsapp/webhook", async (req, res) => {
    try {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      // Use enhanced service for verification
      const result = await enhancedWhatsAppService.verifyWebhook(mode as string, token as string, challenge as string);
      
      if (result) {
        res.status(200).send(result);
      } else {
        res.status(403).send("Forbidden");
      }
    } catch (error) {
      res.status(500).json({ error: "Webhook verification failed" });
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const messageData = req.body;
      const messageId = messageData?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
      
      // Simple in-memory duplicate message detection
      if (messageId) {
        const now = Date.now();
        const processedMessages = (global as any).processedWhatsAppMessages || {};
        
        // Clean up old entries (older than 5 minutes)
        for (const [id, timestamp] of Object.entries(processedMessages)) {
          if (now - (timestamp as number) > 5 * 60 * 1000) {
            delete processedMessages[id];
          }
        }
        
        // Check if this message was recently processed
        if (processedMessages[messageId]) {
          console.log(`Skipping duplicate message: ${messageId}`);
          res.status(200).send("OK");
          return;
        }
        
        // Mark this message as processed
        processedMessages[messageId] = now;
        (global as any).processedWhatsAppMessages = processedMessages;
      }
      
      // Use enhanced service for processing messages with better flow handling
      await enhancedWhatsAppService.processIncomingMessage(messageData);
      res.status(200).send("OK");
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // WhatsApp conversations APIs for dashboard
  app.get("/api/whatsapp/conversations", async (req, res) => {
    try {
      const { status, search } = req.query as Record<string, string>;
      const list = await storage.listConversations();
      res.json(list);
    } catch (error) {
      console.error("GET /api/whatsapp/conversations error", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/whatsapp/conversations/:id/messages", async (req, res) => {
    try {
      const convo = await storage.getConversation(req.params.id);
      if (!convo) return res.status(404).json({ error: "Conversation not found" });
      const messages = await storage.listMessages(req.params.id);
      res.json({ conversation: convo, messages });
    } catch (error) {
      console.error("GET /api/whatsapp/conversations/:id/messages error", error);
      res.status(500).json({ error: "Failed to fetch conversation messages" });
    }
  });

  // WhatsApp logs API for dashboard
  app.get("/api/whatsapp/logs", async (req, res) => {
    try {
      const logs = await storage.getWhatsappLogs();
      res.json(logs);
    } catch (error) {
      console.error("GET /api/whatsapp/logs error", error);
      res.status(500).json({ error: "Failed to fetch WhatsApp logs" });
    }
  });

  app.post("/api/whatsapp/conversations/:id/assign", async (req, res) => {
    try {
      const Body = z.object({ agentUserId: z.string().nullable().optional(), status: z.enum(["open","pending","closed"]).optional() });
      const { agentUserId, status } = Body.parse(req.body || {});
      const convo = await storage.getConversation(req.params.id);
      if (!convo) return res.status(404).json({ error: "Conversation not found" });
      const updated = await storage.updateConversation(req.params.id, { agentUserId: agentUserId ?? undefined, status });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid payload", details: error.errors });
      console.error("POST /api/whatsapp/conversations/:id/assign error", error);
      res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  // Agent reply to a conversation (uses WhatsApp send API and persists message)
  app.post("/api/whatsapp/conversations/:id/reply", async (req, res) => {
    try {
      const Body = z.object({ message: z.string().min(1) });
      const { message } = Body.parse(req.body || {});
      const convo = await storage.getConversation(req.params.id);
      if (!convo) return res.status(404).json({ error: "Conversation not found" });
      await whatsappService.sendWhatsAppMessage(convo.phone, message);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid payload", details: error.errors });
      console.error("POST /api/whatsapp/conversations/:id/reply error", error);
      res.status(500).json({ error: "Failed to send reply" });
    }
  });

  // Send a custom WhatsApp message from the dashboard
  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const BodySchema = z.object({
        phone: z.string().min(6),
        message: z.string().min(1),
      });
      const { phone, message } = BodySchema.parse(req.body || {});

      await whatsappService.sendWhatsAppMessage(phone, message);

      // Log the manual send for auditability
      try {
        await storage.createWhatsappLog({
          userPhone: phone,
          action: "manual_message",
          aiResponse: message,
          status: "processed",
        });
      } catch (e) {
        // Non-fatal: continue even if logging fails
        console.warn("/api/whatsapp/send log failure", e);
      }

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid payload", details: error.errors });
      }
      console.error("POST /api/whatsapp/send error", error);
      res.status(500).json({ error: "Failed to send WhatsApp message" });
    }
  });

  // Analytics routes
  app.get("/api/analytics/dashboard", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Stock movements
  app.get("/api/stock-movements", async (req, res) => {
    try {
      const { productId } = req.query;
      const movements = await storage.getStockMovements(productId as string);
      res.json(movements);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stock movements" });
    }
  });

  // Test endpoint for NLP inventory command parsing
  app.post("/api/test/nlp-parse", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }
      
      // Get available products for context
      const products = await storage.getProducts();
      
      // Parse the inventory command
      const result = await parseInventoryCommand(message, products);
      
      res.json(result);
    } catch (error) {
      console.error("Error testing NLP parsing:", error);
      res.status(500).json({ error: "Failed to parse inventory command" });
    }
  });

  // Image Recognition and Product Image Management Routes
  
  // Upload product image
  app.post("/api/products/:id/images", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const productId = req.params.id;
      const result = await productImageManager.saveProductImage(productId, req.file.buffer);
      
      if (result.success) {
        res.status(201).json({
          success: true,
          imageUrl: result.imageUrl,
          message: "Image uploaded and indexed successfully"
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error uploading product image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // Upload product image from URL
  app.post("/api/products/:id/images/from-url", async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      const productId = req.params.id;
      const result = await productImageManager.saveProductImageFromUrl(productId, imageUrl);
      
      if (result.success) {
        res.status(201).json({
          success: true,
          imageUrl: result.localImageUrl,
          message: "Image downloaded and indexed successfully"
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error uploading product image from URL:", error);
      res.status(500).json({ error: "Failed to upload image from URL" });
    }
  });

  // Get product images
  app.get("/api/products/:id/images", async (req, res) => {
    try {
      const productId = req.params.id;
      const images = await productImageManager.getProductImages(productId);
      res.json(images);
    } catch (error) {
      console.error("Error getting product images:", error);
      res.status(500).json({ error: "Failed to get product images" });
    }
  });

  // Delete product image
  app.delete("/api/products/:id/images", async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      const productId = req.params.id;
      const result = await productImageManager.deleteProductImage(productId, imageUrl);
      
      if (result.success) {
        res.json({ success: true, message: "Image deleted successfully" });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error("Error deleting product image:", error);
      res.status(500).json({ error: "Failed to delete image" });
    }
  });

  // Process image for product identification
  app.post("/api/image-recognition/identify", upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const result = await imageRecognitionService.processImageBuffer(req.file.buffer);
      
      res.json({
        success: result.success,
        matches: result.matches,
        extractedText: result.extractedText,
        processingTime: result.processingTime,
        error: result.error
      });
    } catch (error) {
      console.error("Error processing image for identification:", error);
      res.status(500).json({ error: "Failed to process image" });
    }
  });

  // Process image from URL for product identification
  app.post("/api/image-recognition/identify-url", async (req, res) => {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      const result = await imageRecognitionService.processImageFromUrl(imageUrl);
      
      res.json({
        success: result.success,
        matches: result.matches,
        extractedText: result.extractedText,
        processingTime: result.processingTime,
        error: result.error
      });
    } catch (error) {
      console.error("Error processing image from URL:", error);
      res.status(500).json({ error: "Failed to process image from URL" });
    }
  });

  // Get image recognition service status
  app.get("/api/image-recognition/status", async (req, res) => {
    try {
      const status = imageRecognitionService.getStatus();
      const stats = await productImageManager.getStats();
      
      res.json({
        recognitionService: status,
        imageManagement: {
          totalProducts: stats.totalProducts,
          productsWithImages: stats.productsWithImages,
          productsWithoutImages: stats.productsWithoutImages,
          totalImages: stats.totalImages
        }
      });
    } catch (error) {
      console.error("Error getting image recognition status:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  // Sync images with recognition service
  app.post("/api/image-recognition/sync", async (req, res) => {
    try {
      const result = await productImageManager.syncWithRecognitionService();
      res.json(result);
    } catch (error) {
      console.error("Error syncing with recognition service:", error);
      res.status(500).json({ error: "Failed to sync with recognition service" });
    }
  });

  // Reload recognition service
  app.post("/api/image-recognition/reload", async (req, res) => {
    try {
      await imageRecognitionService.reload();
      res.json({ success: true, message: "Recognition service reloaded" });
    } catch (error) {
      console.error("Error reloading recognition service:", error);
      res.status(500).json({ error: "Failed to reload recognition service" });
    }
  });

  // Bulk upload images for multiple products
  app.post("/api/products/bulk-images", upload.array('images', 50), async (req, res) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      const { productIds } = req.body;
      if (!productIds) {
        return res.status(400).json({ error: "Product IDs are required" });
      }

      const ids = JSON.parse(productIds);
      if (!Array.isArray(ids) || ids.length !== req.files.length) {
        return res.status(400).json({ error: "Number of product IDs must match number of images" });
      }

      const uploads = req.files.map((file, index) => ({
        productId: ids[index],
        imageBuffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype
      }));

      const result = await productImageManager.bulkUploadProductImages(uploads);
      
      res.json({
        success: result.success,
        failed: result.failed,
        results: result.results,
        message: `Uploaded ${result.success} images, ${result.failed} failed`
      });
    } catch (error) {
      console.error("Error bulk uploading product images:", error);
      res.status(500).json({ error: "Failed to bulk upload images" });
    }
  });

  // Serve images from database
  app.get('/api/images/:imageId', async (req, res) => {
    try {
      const { imageId } = req.params;
      const result = await databaseImageStorage.getImage(imageId);
      
      if (!result.success) {
        return res.status(404).json({ error: result.error });
      }

      res.set({
        'Content-Type': result.mimeType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'Content-Length': result.buffer.length
      });
      
      res.send(result.buffer);
    } catch (error) {
      console.error('Error serving image:', error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });

  // Serve uploaded product images (legacy fallback)
  app.use('/uploads/products', express.static(path.join(process.cwd(), 'uploads', 'products')));
  // Also serve static uploads from dist when running from compiled build
  app.use('/uploads', express.static(path.join(process.cwd(), 'dist', 'uploads')));

  const purchasesDir = path.join(process.cwd(), 'uploads', 'purchases');
  if (!fs.existsSync(purchasesDir)) {
    fs.mkdirSync(purchasesDir, { recursive: true });
  }
  app.use('/uploads/purchases', express.static(purchasesDir));

  // Purchases routes
  app.get("/api/purchases", async (req, res) => {
    try {
      const { userId } = req.query;
      const purchases = await storage.getPurchases(userId as string);
      res.json(purchases);
    } catch (error) {
      console.error("GET /api/purchases error", error);
      res.status(500).json({ error: "Failed to fetch purchases" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
