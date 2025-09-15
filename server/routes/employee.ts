import type { Express } from 'express';
import { storage } from '../storage';
import { authenticate, authorize, AuthenticatedRequest } from '../auth/middleware';
import { z } from 'zod';
import { insertOrderSchema, insertOrderItemSchema } from '@shared/schema';

export function registerEmployeeRoutes(app: Express) {
  // Employee dashboard - shows limited information relevant to employees
  app.get('/api/employee/dashboard', 
    authenticate, 
    authorize('system', 'access'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const stats = await storage.getDashboardStats();
        
        // Return limited stats for employees
        res.json({
          totalProducts: stats.totalProducts,
          lowStockCount: stats.lowStockCount,
          myRecentOrders: 5, // This would be filtered by user
          systemStatus: 'operational'
        });
      } catch (error) {
        console.error('Employee dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
      }
    }
  );

  // Employee access to vendor catalog (read-only)
  app.get('/api/employee/vendors', 
    authenticate, 
    authorize('vendors', 'read'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        // Import vendor storage methods
        const { storage: vendorStorage } = await import('../vendor-storage');
        
        const { search, category, status } = req.query as Record<string, string>;
        const vendors = await vendorStorage.getVendors({
          search,
          category,
          status: status || 'active'
        });

        // Return vendor information relevant to employees (limited fields)
        const employeeVendorView = vendors.map(vendor => ({
          id: vendor.id,
          name: vendor.name,
          mainCategory: vendor.mainCategory,
          subcategory: vendor.subcategory,
          productType: vendor.productType,
          contactNumber: vendor.contactNumber,
          email: vendor.email,
          location: vendor.location,
          city: vendor.city,
          state: vendor.state,
          status: vendor.status,
          rating: vendor.rating
        }));

        res.json(employeeVendorView);
      } catch (error) {
        console.error('Employee vendors error:', error);
        res.status(500).json({ error: 'Failed to fetch vendors' });
      }
    }
  );

  // Get specific vendor details (for ordering)
  app.get('/api/employee/vendors/:id', 
    authenticate, 
    authorize('vendors', 'read'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const { storage: vendorStorage } = await import('../vendor-storage');
        const vendor = await vendorStorage.getVendor(req.params.id);
        
        if (!vendor) {
          return res.status(404).json({ error: 'Vendor not found' });
        }

        // Get vendor products for ordering
        const vendorProducts = await vendorStorage.getVendorProducts(req.params.id);
        
        res.json({
          vendor: {
            id: vendor.id,
            name: vendor.name,
            mainCategory: vendor.mainCategory,
            subcategory: vendor.subcategory,
            productType: vendor.productType,
            contactNumber: vendor.contactNumber,
            email: vendor.email,
            location: vendor.location,
            city: vendor.city,
            state: vendor.state,
          },
          products: vendorProducts
        });
      } catch (error) {
        console.error('Employee vendor details error:', error);
        res.status(500).json({ error: 'Failed to fetch vendor details' });
      }
    }
  );

  // Employee access to product catalog (read-only)
  app.get('/api/employee/products', 
    authenticate, 
    authorize('products', 'read'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const { search, category, lowStock } = req.query as Record<string, string>;
        
        let products;
        if (lowStock === 'true') {
          products = await storage.getLowStockProducts();
        } else {
          products = await storage.getProducts({
            search,
            category
          });
        }

        // Return product information relevant to employees
        const employeeProductView = products.map(product => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          description: product.description,
          type: product.type,
          price: product.price,
          stockAvailable: product.stockAvailable,
          stockTotal: product.stockTotal,
          minStockLevel: product.minStockLevel,
          imageUrl: product.imageUrl,
          units: product.units
        }));

        res.json(employeeProductView);
      } catch (error) {
        console.error('Employee products error:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
      }
    }
  );

  // Search products for ordering
  app.get('/api/employee/products/search', 
    authenticate, 
    authorize('products', 'read'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const { q: query } = req.query as Record<string, string>;
        
        if (!query) {
          return res.status(400).json({ error: 'Search query is required' });
        }

        const products = await storage.searchProducts(query);
        
        res.json(products.map(product => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          description: product.description,
          type: product.type,
          price: product.price,
          stockAvailable: product.stockAvailable,
          units: product.units,
          imageUrl: product.imageUrl
        })));
      } catch (error) {
        console.error('Employee product search error:', error);
        res.status(500).json({ error: 'Failed to search products' });
      }
    }
  );

  // Create order (employees can create orders)
  app.post('/api/employee/orders', 
    authenticate, 
    authorize('orders', 'create'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const { order: orderData, items } = req.body;
        
        // Validate order data
        const validatedOrder = insertOrderSchema.parse(orderData);
        const validatedItems = items.map((item: any) => insertOrderItemSchema.parse(item));

        // Add employee information to order
        const orderWithEmployee = {
          ...validatedOrder,
          customerName: orderData.customerName || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.username,
          customerEmail: orderData.customerEmail || req.user?.email,
          notes: orderData.notes ? `${orderData.notes} (Created by: ${req.user?.username})` : `Created by: ${req.user?.username}`
        };

        const order = await storage.createOrder(orderWithEmployee, validatedItems);
        
        res.status(201).json({
          ...order,
          message: 'Order created successfully',
          requiresApproval: order.status === 'needs_approval'
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: 'Invalid order data', details: error.errors });
        }
        console.error('Employee create order error:', error);
        res.status(500).json({ error: 'Failed to create order' });
      }
    }
  );

  // View employee's orders
  app.get('/api/employee/orders', 
    authenticate, 
    authorize('orders', 'read'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const { status, dateFrom, dateTo } = req.query as Record<string, string>;
        
        // Get orders - for employees, we might want to filter by their created orders
        const orders = await storage.getOrders({
          status,
          dateFrom,
          dateTo,
          // In a real implementation, you might want to filter by orders created by this employee
          customer: req.user?.username // This is a simple way to filter, in practice you'd have a createdBy field
        });

        res.json(orders.map(order => ({
          id: order.order.id,
          orderNumber: order.order.orderNumber,
          status: order.order.status,
          total: order.order.total,
          customerName: order.order.customerName,
          createdAt: order.order.createdAt,
          itemCount: order.itemCount,
          approvalStatus: order.order.approvalStatus,
        })));
      } catch (error) {
        console.error('Employee orders error:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
      }
    }
  );

  // View specific order details
  app.get('/api/employee/orders/:id', 
    authenticate, 
    authorize('orders', 'read'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const order = await storage.getOrder(req.params.id);
        
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order);
      } catch (error) {
        console.error('Employee order details error:', error);
        res.status(500).json({ error: 'Failed to fetch order details' });
      }
    }
  );

  // Employee profile and permissions
  app.get('/api/employee/profile', 
    authenticate, 
    async (req: AuthenticatedRequest, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'User not authenticated' });
        }

        const permissions = await storage.getUserPermissions(req.user.id);
        
        res.json({
          user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            role: req.user.role,
          },
          permissions
        });
      } catch (error) {
        console.error('Employee profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
      }
    }
  );

  // Quick stock check for ordering
  app.post('/api/employee/stock/check', 
    authenticate, 
    authorize('products', 'read'), 
    async (req: AuthenticatedRequest, res) => {
      try {
        const { productIds } = req.body;
        
        if (!Array.isArray(productIds)) {
          return res.status(400).json({ error: 'Product IDs array is required' });
        }

        const stockInfo = await Promise.all(
          productIds.map(async (productId: string) => {
            const product = await storage.getProduct(productId);
            return {
              productId,
              available: product?.stockAvailable || 0,
              total: product?.stockTotal || 0,
              name: product?.name || 'Unknown Product',
              sku: product?.sku || '',
              inStock: (product?.stockAvailable || 0) > 0
            };
          })
        );

        res.json({ products: stockInfo });
      } catch (error) {
        console.error('Employee stock check error:', error);
        res.status(500).json({ error: 'Failed to check stock' });
      }
    }
  );
}
