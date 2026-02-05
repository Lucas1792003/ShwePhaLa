import type { Role } from "../../types";

export type Permission =
  // POS & Sales
  | "VIEW_POS"
  | "VIEW_SALES"
  | "VIEW_SHIFTS"
  // Inventory & Stock
  | "VIEW_INVENTORY"
  | "VIEW_TRANSFERS"
  | "MANAGE_TRANSFERS"
  // Approvals
  | "VIEW_APPROVALS"
  // Reports
  | "VIEW_REPORTS"
  | "VIEW_GLOBAL_REPORTS"
  | "VIEW_PROFIT_REPORTS"
  | "VIEW_AUDIT"
  // Suppliers & Purchasing
  | "VIEW_SUPPLIERS"
  | "MANAGE_SUPPLIERS"
  | "VIEW_PURCHASES"
  | "MANAGE_PURCHASES"
  // Admin
  | "MANAGE_SHOPS"
  | "MANAGE_USERS"
  | "MANAGE_PRODUCTS"
  | "MANAGE_BARCODES"
  | "MANAGE_PRICING"
  // Catalog
  | "VIEW_CATALOG";

export const rolePermissions: Record<Role, Permission[]> = {
  ADMIN: [
    // Full access
    "VIEW_POS",
    "VIEW_SALES",
    "VIEW_SHIFTS",
    "VIEW_INVENTORY",
    "VIEW_TRANSFERS",
    "MANAGE_TRANSFERS",
    "VIEW_APPROVALS",
    "VIEW_REPORTS",
    "VIEW_GLOBAL_REPORTS",
    "VIEW_PROFIT_REPORTS",
    "VIEW_AUDIT",
    "VIEW_SUPPLIERS",
    "MANAGE_SUPPLIERS",
    "VIEW_PURCHASES",
    "MANAGE_PURCHASES",
    "MANAGE_SHOPS",
    "MANAGE_USERS",
    "MANAGE_PRODUCTS",
    "MANAGE_BARCODES",
    "MANAGE_PRICING",
    "VIEW_CATALOG",
  ],
  MANAGER: [
    // Shop-level management
    "VIEW_POS",
    "VIEW_SALES",
    "VIEW_SHIFTS",
    "VIEW_INVENTORY",
    "VIEW_TRANSFERS",
    "MANAGE_TRANSFERS",
    "VIEW_APPROVALS",
    "VIEW_REPORTS",
    "VIEW_PROFIT_REPORTS",
    "VIEW_SUPPLIERS",
    "VIEW_PURCHASES",
    "MANAGE_PURCHASES",
    "VIEW_CATALOG",
  ],
  CASHIER: [
    // POS operations
    "VIEW_POS",
    "VIEW_SALES",
    "VIEW_SHIFTS",
    "VIEW_TRANSFERS",
    "VIEW_CATALOG",
  ],
  BUYER: ["VIEW_CATALOG"],
};

export const hasPermission = (role: Role, permission: Permission) => rolePermissions[role]?.includes(permission);

export const hasAnyPermission = (role: Role, permissions: Permission[]) =>
  permissions.some((permission) => hasPermission(role, permission));
