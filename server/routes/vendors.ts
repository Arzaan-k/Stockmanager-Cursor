import type { Express } from "express";
import { vendorStorage } from "../vendor-storage";
import { z } from "zod";
import XLSX from "xlsx";

// Validation schemas
const createVendorSchema = z.object({
  name: z.string().min(1),
  mainCategory: z.string().min(1),
  subcategory: z.string().min(1),
  productType: z.string().min(1),
  productCode: z.string().min(1),
  otherProducts: z.string().optional(),
  contactNumber: z.string().min(1),
  email: z.string().email().optional(),
  location: z.string().min(1),
  address: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  zone: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending', 'suspended']).optional(),
  notes: z.string().optional(),
});

const vendorProductSchema = z.object({
  vendorId: z.string(),
  productId: z.string(),
  supplierCode: z.string().optional(),
  price: z.string().optional(),
  leadTimeDays: z.string().optional(),
  minimumOrderQuantity: z.string().optional(),
  isPreferred: z.boolean().optional(),
});

const vendorContactSchema = z.object({
  vendorId: z.string(),
  name: z.string().min(1),
  designation: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isPrimary: z.boolean().optional(),
});

export function registerVendorRoutes(app: Express) {
  // Get all vendors with filters
  app.get("/api/vendors", async (req, res) => {
    try {
      const { search, category, subcategory, status, city } = req.query;
      const vendors = await vendorStorage.getVendors({
        search: search as string,
        category: category as string,
        subcategory: subcategory as string,
        status: status as string,
        city: city as string,
      });
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });

  // Get vendor statistics
  app.get("/api/vendors/stats", async (req, res) => {
    try {
      const stats = await vendorStorage.getVendorStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching vendor stats:", error);
      res.status(500).json({ error: "Failed to fetch vendor statistics" });
    }
  });

  // Get single vendor by ID
  app.get("/api/vendors/:id", async (req, res) => {
    try {
      const vendor = await vendorStorage.getVendor(req.params.id);
      if (!vendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      res.json(vendor);
    } catch (error) {
      console.error("Error fetching vendor:", error);
      res.status(500).json({ error: "Failed to fetch vendor" });
    }
  });

  // Create new vendor
  app.post("/api/vendors", async (req, res) => {
    try {
      const validated = createVendorSchema.parse(req.body);
      const vendor = await vendorStorage.createVendor(validated);
      res.status(201).json(vendor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid vendor data", details: error.errors });
      }
      console.error("Error creating vendor:", error);
      res.status(500).json({ error: "Failed to create vendor" });
    }
  });

  // Update vendor
  app.put("/api/vendors/:id", async (req, res) => {
    try {
      const vendor = await vendorStorage.updateVendor(req.params.id, req.body);
      res.json(vendor);
    } catch (error) {
      console.error("Error updating vendor:", error);
      res.status(500).json({ error: "Failed to update vendor" });
    }
  });

  // Delete vendor (soft delete)
  app.delete("/api/vendors/:id", async (req, res) => {
    try {
      await vendorStorage.deleteVendor(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ error: "Failed to delete vendor" });
    }
  });

  // Get vendor products
  app.get("/api/vendors/:id/products", async (req, res) => {
    try {
      const products = await vendorStorage.getVendorProducts(req.params.id);
      res.json(products);
    } catch (error) {
      console.error("Error fetching vendor products:", error);
      res.status(500).json({ error: "Failed to fetch vendor products" });
    }
  });

  // Add product to vendor
  app.post("/api/vendors/:id/products", async (req, res) => {
    try {
      const validated = vendorProductSchema.parse({ ...req.body, vendorId: req.params.id });
      const vendorProduct = await vendorStorage.addVendorProduct(validated);
      res.status(201).json(vendorProduct);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid product data", details: error.errors });
      }
      console.error("Error adding vendor product:", error);
      res.status(500).json({ error: "Failed to add vendor product" });
    }
  });

  // Remove product from vendor
  app.delete("/api/vendors/:vendorId/products/:productId", async (req, res) => {
    try {
      await vendorStorage.removeVendorProduct(req.params.vendorId, req.params.productId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing vendor product:", error);
      res.status(500).json({ error: "Failed to remove vendor product" });
    }
  });

  // Get vendor contacts
  app.get("/api/vendors/:id/contacts", async (req, res) => {
    try {
      const contacts = await vendorStorage.getVendorContacts(req.params.id);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching vendor contacts:", error);
      res.status(500).json({ error: "Failed to fetch vendor contacts" });
    }
  });

  // Add vendor contact
  app.post("/api/vendors/:id/contacts", async (req, res) => {
    try {
      const validated = vendorContactSchema.parse({ ...req.body, vendorId: req.params.id });
      const contact = await vendorStorage.addVendorContact(validated);
      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid contact data", details: error.errors });
      }
      console.error("Error adding vendor contact:", error);
      res.status(500).json({ error: "Failed to add vendor contact" });
    }
  });

  // Update vendor contact
  app.put("/api/vendor-contacts/:id", async (req, res) => {
    try {
      const contact = await vendorStorage.updateVendorContact(req.params.id, req.body);
      res.json(contact);
    } catch (error) {
      console.error("Error updating vendor contact:", error);
      res.status(500).json({ error: "Failed to update vendor contact" });
    }
  });

  // Delete vendor contact
  app.delete("/api/vendor-contacts/:id", async (req, res) => {
    try {
      await vendorStorage.deleteVendorContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting vendor contact:", error);
      res.status(500).json({ error: "Failed to delete vendor contact" });
    }
  });

  // Get vendor transactions
  app.get("/api/vendors/:id/transactions", async (req, res) => {
    try {
      const transactions = await vendorStorage.getVendorTransactions(req.params.id);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching vendor transactions:", error);
      res.status(500).json({ error: "Failed to fetch vendor transactions" });
    }
  });

  // Create vendor transaction
  app.post("/api/vendors/:id/transactions", async (req, res) => {
    try {
      const transaction = await vendorStorage.createVendorTransaction({
        ...req.body,
        vendorId: req.params.id,
      });
      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating vendor transaction:", error);
      res.status(500).json({ error: "Failed to create vendor transaction" });
    }
  });

  // Get vendors by product type
  app.get("/api/vendors/by-product/:productType", async (req, res) => {
    try {
      const vendors = await vendorStorage.getVendorsByProduct(req.params.productType);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors by product:", error);
      res.status(500).json({ error: "Failed to fetch vendors by product" });
    }
  });

  // Get product vendors (vendors supplying a specific product)
  app.get("/api/products/:productId/vendors", async (req, res) => {
    try {
      const vendors = await vendorStorage.getProductVendors(req.params.productId);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching product vendors:", error);
      res.status(500).json({ error: "Failed to fetch product vendors" });
    }
  });

  // Import vendors from Excel
  app.post("/api/vendors/import", async (req, res) => {
    try {
      const { data } = req.body;
      
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Invalid data format. Expected array of vendor objects." });
      }

      // Map Excel data to vendor format
      const vendorData = data.map(row => ({
        name: row['Vendor Name'] || row.name,
        mainCategory: row['Main Category'] || row.mainCategory,
        subcategory: row['Subcategory'] || row.subcategory,
        productType: row['Product Type'] || row.productType,
        productCode: row['Product Code'] || row.productCode,
        otherProducts: row['Other Products/Services'] || row.otherProducts,
        contactNumber: row['Contact Number'] || row.contactNumber,
        location: row['Location'] || row.location,
        city: row['City'] || row.city,
        state: row['State'] || row.state,
        zone: row['Zone'] || row.zone,
        status: row['Status Of Vendor'] || row.status,
      }));

      const result = await vendorStorage.importVendorsFromExcel(vendorData);
      res.json(result);
    } catch (error) {
      console.error("Error importing vendors:", error);
      res.status(500).json({ error: "Failed to import vendors" });
    }
  });

  // Import vendors from existing Excel file
  app.post("/api/vendors/import-excel-file", async (req, res) => {
    try {
      // Read the Excel file from the project
      const workbook = XLSX.readFile('Vendor Category Matersheet Final.xlsx');
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      // Map Excel data to vendor format
      const vendorData = data.map((row: any) => ({
        name: row['Vendor Name'],
        mainCategory: row['Main Category'],
        subcategory: row['Subcategory'],
        productType: row['Product Type'],
        productCode: row['Product Code'],
        otherProducts: row['Other Products/Services'],
        contactNumber: String(row['Contact Number']),
        location: row['Location'],
        city: row['City'],
        state: row['State'],
        zone: row['Zone'],
        status: row['Status Of Vendor'],
      }));

      const result = await vendorStorage.importVendorsFromExcel(vendorData);
      res.json({
        ...result,
        message: `Successfully imported ${result.imported} vendors from Excel file`
      });
    } catch (error) {
      console.error("Error importing vendors from Excel:", error);
      res.status(500).json({ error: "Failed to import vendors from Excel file" });
    }
  });
}
