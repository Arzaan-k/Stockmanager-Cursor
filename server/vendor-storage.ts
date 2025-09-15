import { 
  vendors, vendorProducts, vendorContacts, vendorTransactions,
  type Vendor, type InsertVendor, 
  type VendorProduct, type InsertVendorProduct,
  type VendorContact, type InsertVendorContact,
  type VendorTransaction, type InsertVendorTransaction,
  products
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, like, and, or, sql, inArray } from "drizzle-orm";

export interface IVendorStorage {
  // Vendors
  getVendors(filters?: { 
    search?: string; 
    category?: string; 
    subcategory?: string;
    status?: string;
    city?: string;
  }): Promise<Vendor[]>;
  getVendor(id: string): Promise<Vendor | undefined>;
  getVendorByProductCode(productCode: string): Promise<Vendor | undefined>;
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  updateVendor(id: string, vendor: Partial<InsertVendor>): Promise<Vendor>;
  deleteVendor(id: string): Promise<void>;
  
  // Vendor Products
  getVendorProducts(vendorId: string): Promise<any[]>;
  getProductVendors(productId: string): Promise<any[]>;
  addVendorProduct(vendorProduct: InsertVendorProduct): Promise<VendorProduct>;
  updateVendorProduct(id: string, vendorProduct: Partial<InsertVendorProduct>): Promise<VendorProduct>;
  removeVendorProduct(vendorId: string, productId: string): Promise<void>;
  
  // Vendor Contacts
  getVendorContacts(vendorId: string): Promise<VendorContact[]>;
  addVendorContact(contact: InsertVendorContact): Promise<VendorContact>;
  updateVendorContact(id: string, contact: Partial<InsertVendorContact>): Promise<VendorContact>;
  deleteVendorContact(id: string): Promise<void>;
  
  // Vendor Transactions
  getVendorTransactions(vendorId: string): Promise<VendorTransaction[]>;
  createVendorTransaction(transaction: InsertVendorTransaction): Promise<VendorTransaction>;
  
  // Analytics
  getVendorStats(): Promise<any>;
  getVendorsByProduct(productType: string): Promise<Vendor[]>;
  importVendorsFromExcel(vendorData: any[]): Promise<{ imported: number; errors: string[] }>;
}

export class VendorDatabaseStorage implements IVendorStorage {
  async getVendors(filters?: { 
    search?: string; 
    category?: string; 
    subcategory?: string;
    status?: string;
    city?: string;
  }): Promise<Vendor[]> {
    const conditions = [eq(vendors.isActive, true)];
    
    if (filters?.search) {
      conditions.push(
        or(
          like(vendors.name, `%${filters.search}%`),
          like(vendors.productType, `%${filters.search}%`),
          like(vendors.location, `%${filters.search}%`)
        )!
      );
    }
    
    if (filters?.category) {
      conditions.push(eq(vendors.mainCategory, filters.category));
    }
    
    if (filters?.subcategory) {
      conditions.push(eq(vendors.subcategory, filters.subcategory));
    }
    
    if (filters?.status) {
      conditions.push(eq(vendors.status, filters.status as any));
    }
    
    if (filters?.city) {
      conditions.push(eq(vendors.city, filters.city));
    }

    return await db
      .select()
      .from(vendors)
      .where(and(...conditions))
      .orderBy(asc(vendors.name));
  }

  async getVendor(id: string): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    return vendor || undefined;
  }

  async getVendorByProductCode(productCode: string): Promise<Vendor | undefined> {
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.productCode, productCode));
    return vendor || undefined;
  }

  async createVendor(insertVendor: InsertVendor): Promise<Vendor> {
    const [vendor] = await db
      .insert(vendors)
      .values(insertVendor)
      .returning();
    return vendor;
  }

  async updateVendor(id: string, updateVendor: Partial<InsertVendor>): Promise<Vendor> {
    const [vendor] = await db
      .update(vendors)
      .set({
        ...updateVendor,
        updatedAt: new Date().toISOString()
      })
      .where(eq(vendors.id, id))
      .returning();
    return vendor;
  }

  async deleteVendor(id: string): Promise<void> {
    // Soft delete
    await db
      .update(vendors)
      .set({ isActive: false, updatedAt: new Date().toISOString() })
      .where(eq(vendors.id, id));
  }

  async getVendorProducts(vendorId: string): Promise<any[]> {
    return await db
      .select({
        vendorProduct: vendorProducts,
        product: products
      })
      .from(vendorProducts)
      .leftJoin(products, eq(vendorProducts.productId, products.id))
      .where(eq(vendorProducts.vendorId, vendorId));
  }

  async getProductVendors(productId: string): Promise<any[]> {
    return await db
      .select({
        vendor: vendors,
        vendorProduct: vendorProducts
      })
      .from(vendorProducts)
      .leftJoin(vendors, eq(vendorProducts.vendorId, vendors.id))
      .where(
        and(
          eq(vendorProducts.productId, productId),
          eq(vendors.isActive, true)
        )
      )
      .orderBy(desc(vendorProducts.isPreferred), asc(vendors.name));
  }

  async addVendorProduct(insertVendorProduct: InsertVendorProduct): Promise<VendorProduct> {
    const [vendorProduct] = await db
      .insert(vendorProducts)
      .values(insertVendorProduct)
      .returning();
    return vendorProduct;
  }

  async updateVendorProduct(id: string, updateVendorProduct: Partial<InsertVendorProduct>): Promise<VendorProduct> {
    const [vendorProduct] = await db
      .update(vendorProducts)
      .set(updateVendorProduct)
      .where(eq(vendorProducts.id, id))
      .returning();
    return vendorProduct;
  }

  async removeVendorProduct(vendorId: string, productId: string): Promise<void> {
    await db
      .delete(vendorProducts)
      .where(
        and(
          eq(vendorProducts.vendorId, vendorId),
          eq(vendorProducts.productId, productId)
        )
      );
  }

  async getVendorContacts(vendorId: string): Promise<VendorContact[]> {
    return await db
      .select()
      .from(vendorContacts)
      .where(eq(vendorContacts.vendorId, vendorId))
      .orderBy(desc(vendorContacts.isPrimary), asc(vendorContacts.name));
  }

  async addVendorContact(insertContact: InsertVendorContact): Promise<VendorContact> {
    const [contact] = await db
      .insert(vendorContacts)
      .values(insertContact)
      .returning();
    return contact;
  }

  async updateVendorContact(id: string, updateContact: Partial<InsertVendorContact>): Promise<VendorContact> {
    const [contact] = await db
      .update(vendorContacts)
      .set(updateContact)
      .where(eq(vendorContacts.id, id))
      .returning();
    return contact;
  }

  async deleteVendorContact(id: string): Promise<void> {
    await db.delete(vendorContacts).where(eq(vendorContacts.id, id));
  }

  async getVendorTransactions(vendorId: string): Promise<VendorTransaction[]> {
    return await db
      .select()
      .from(vendorTransactions)
      .where(eq(vendorTransactions.vendorId, vendorId))
      .orderBy(desc(vendorTransactions.transactionDate));
  }

  async createVendorTransaction(insertTransaction: InsertVendorTransaction): Promise<VendorTransaction> {
    const [transaction] = await db
      .insert(vendorTransactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async getVendorStats(): Promise<any> {
    const totalVendors = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendors)
      .where(eq(vendors.isActive, true));

    const activeVendors = await db
      .select({ count: sql<number>`count(*)` })
      .from(vendors)
      .where(
        and(
          eq(vendors.isActive, true),
          eq(vendors.status, 'active' as any)
        )
      );

    const vendorsByCategory = await db
      .select({
        category: vendors.mainCategory,
        count: sql<number>`count(*)`
      })
      .from(vendors)
      .where(eq(vendors.isActive, true))
      .groupBy(vendors.mainCategory);

    const vendorsByCity = await db
      .select({
        city: vendors.city,
        count: sql<number>`count(*)`
      })
      .from(vendors)
      .where(eq(vendors.isActive, true))
      .groupBy(vendors.city)
      .orderBy(desc(sql<number>`count(*)`))
      .limit(10);

    return {
      totalVendors: totalVendors[0]?.count || 0,
      activeVendors: activeVendors[0]?.count || 0,
      vendorsByCategory,
      vendorsByCity
    };
  }

  async getVendorsByProduct(productType: string): Promise<Vendor[]> {
    return await db
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.isActive, true),
          like(vendors.productType, `%${productType}%`)
        )
      )
      .orderBy(asc(vendors.name));
  }

  async importVendorsFromExcel(vendorData: any[]): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    for (const data of vendorData) {
      try {
        // Check if vendor with same product code exists
        const existing = await this.getVendorByProductCode(data.productCode);
        
        if (existing) {
          // Update existing vendor
          await this.updateVendor(existing.id, {
            name: data.name,
            mainCategory: data.mainCategory,
            subcategory: data.subcategory,
            productType: data.productType,
            otherProducts: data.otherProducts,
            contactNumber: data.contactNumber,
            location: data.location,
            city: data.city,
            state: data.state,
            zone: data.zone,
            status: data.status === 'Active' ? 'active' : 
                   data.status === 'Inactive' ? 'inactive' : 'pending'
          });
        } else {
          // Create new vendor
          await this.createVendor({
            name: data.name,
            mainCategory: data.mainCategory,
            subcategory: data.subcategory,
            productType: data.productType,
            productCode: data.productCode,
            otherProducts: data.otherProducts,
            contactNumber: data.contactNumber,
            location: data.location,
            city: data.city,
            state: data.state,
            zone: data.zone,
            status: data.status === 'Active' ? 'active' : 
                   data.status === 'Inactive' ? 'inactive' : 'pending'
          });
        }
        imported++;
      } catch (error: any) {
        errors.push(`Error importing vendor ${data.name}: ${error.message}`);
      }
    }

    return { imported, errors };
  }
}

// Export singleton instance
export const vendorStorage = new VendorDatabaseStorage();
