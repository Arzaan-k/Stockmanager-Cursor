import { pgTable, varchar, text, timestamp, boolean, pgEnum, unique, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";

// Enhanced user roles enum 
export const userRole = pgEnum("user_role", ['admin', 'employee', 'manager', 'viewer']);

// Permissions table
export const permissions = pgTable("permissions", {
  id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  name: text().notNull(),
  description: text(),
  resource: text().notNull(), // e.g., 'vendors', 'products', 'orders'
  action: text().notNull(), // e.g., 'read', 'create', 'update', 'delete'
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("permissions_name_unique").on(table.name),
  unique("permissions_resource_action_unique").on(table.resource, table.action),
]);

// Role permissions mapping table
export const rolePermissions = pgTable("role_permissions", {
  id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  role: text().notNull(), // We'll use text instead of enum to avoid conflicts
  permissionId: varchar("permission_id").notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.permissionId],
    foreignColumns: [permissions.id],
    name: "role_permissions_permission_id_permissions_id_fk"
  }),
  unique("role_permissions_role_permission_unique").on(table.role, table.permissionId),
]);
