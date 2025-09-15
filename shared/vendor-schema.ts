// Re-export from migrations vendor schema and add type inference
export {
  vendors,
  vendorProducts,
  vendorContacts,
  vendorTransactions,
  vendorStatus,
  vendorCategory
} from "../migrations/vendor-schema";

import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import {
  vendors,
  vendorProducts,
  vendorContacts,
  vendorTransactions
} from "../migrations/vendor-schema";

// Type inference for Vendor
export type Vendor = InferSelectModel<typeof vendors>;
export type InsertVendor = InferInsertModel<typeof vendors>;

// Type inference for VendorProduct
export type VendorProduct = InferSelectModel<typeof vendorProducts>;
export type InsertVendorProduct = InferInsertModel<typeof vendorProducts>;

// Type inference for VendorContact
export type VendorContact = InferSelectModel<typeof vendorContacts>;
export type InsertVendorContact = InferInsertModel<typeof vendorContacts>;

// Type inference for VendorTransaction
export type VendorTransaction = InferSelectModel<typeof vendorTransactions>;
export type InsertVendorTransaction = InferInsertModel<typeof vendorTransactions>;
