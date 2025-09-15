import { pgTable, varchar, text, timestamp, unique, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "../shared/schema";

// Permissions table - NEW TABLE ONLY
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

// Role permissions mapping table - NEW TABLE ONLY
export const rolePermissions = pgTable("role_permissions", {
  id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
  role: text().notNull(), // admin, employee, manager, viewer
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
