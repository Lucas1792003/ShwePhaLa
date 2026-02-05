import type { Permission, Role, User } from "../types";
import { DEFAULT_ROLE_PERMISSIONS, hasPermission, getUserPermissions } from "../types";

// Role hierarchy for backward compatibility
export const roleRank: Record<Role, number> = {
  BUYER: 0,
  CASHIER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

// Legacy role-based check (backward compatible)
export const hasRole = (role: Role, allowed: Role[]) => allowed.includes(role);

// Check if user has minimum role level
export const hasMinRole = (role: Role, minRole: Role) => roleRank[role] >= roleRank[minRole];

// ============================================
// Permission-Based Access Control
// ============================================

// Re-export for convenience
export { hasPermission, getUserPermissions, DEFAULT_ROLE_PERMISSIONS };

// Check if a user can perform a specific action
export const canUser = (user: User | null, permission: Permission): boolean => {
  if (!user) return false;
  if (!user.isActive) return false;
  return hasPermission(user, permission);
};

// Check if user has any of the given permissions
export const canUserAny = (user: User | null, permissions: Permission[]): boolean => {
  if (!user || !user.isActive) return false;
  return permissions.some((p) => hasPermission(user, p));
};

// Check if user has all of the given permissions
export const canUserAll = (user: User | null, permissions: Permission[]): boolean => {
  if (!user || !user.isActive) return false;
  return permissions.every((p) => hasPermission(user, p));
};

// Permission groups for common actions
export const PERMISSION_GROUPS = {
  // Inventory management
  canManageInventory: ["inventory:read", "inventory:adjust"] as Permission[],
  canManageStock: ["inventory:read", "inventory:adjust", "inventory:damage"] as Permission[],

  // Transfer management
  canCreateTransfer: ["transfer:create"] as Permission[],
  canApproveTransfer: ["transfer:approve"] as Permission[],
  canManageTransfers: ["transfer:create", "transfer:approve", "transfer:cancel", "transfer:view"] as Permission[],

  // POS operations
  canUsePOS: ["pos:create_sale"] as Permission[],
  canOverridePrice: ["pos:override_price"] as Permission[],
  canManageRefunds: ["pos:void_sale", "pos:refund"] as Permission[],

  // Supplier & purchasing
  canManageSuppliers: ["supplier:create", "supplier:read", "supplier:update", "supplier:delete"] as Permission[],
  canManagePurchases: ["purchase:create", "purchase:approve", "purchase:receive"] as Permission[],

  // Reporting
  canViewReports: ["report:shop"] as Permission[],
  canViewAllReports: ["report:shop", "report:global", "report:profit"] as Permission[],

  // Admin
  canManageShops: ["shop:create", "shop:read", "shop:update", "shop:delete"] as Permission[],
  canManageUsers: ["user:create", "user:read", "user:update", "user:delete"] as Permission[],
  canManageProducts: ["product:create", "product:read", "product:update", "product:delete", "product:edit_price"] as Permission[],
};

// Quick check helpers
export const canCreateSale = (user: User | null) => canUser(user, "pos:create_sale");
export const canApplyDiscount = (user: User | null) => canUser(user, "pos:apply_discount");
export const canOverridePrice = (user: User | null) => canUser(user, "pos:override_price");
export const canOverrideStock = (user: User | null) => canUser(user, "pos:override_stock");
export const canVoidSale = (user: User | null) => canUser(user, "pos:void_sale");
export const canRefund = (user: User | null) => canUser(user, "pos:refund");
export const canAdjustInventory = (user: User | null) => canUser(user, "inventory:adjust");
export const canRecordDamage = (user: User | null) => canUser(user, "inventory:damage");
export const canCreateTransfer = (user: User | null) => canUser(user, "transfer:create");
export const canApproveTransfer = (user: User | null) => canUser(user, "transfer:approve");
export const canViewTransfers = (user: User | null) => canUser(user, "transfer:view");
export const canEditPrice = (user: User | null) => canUser(user, "product:edit_price");
export const canViewProfit = (user: User | null) => canUser(user, "report:profit");
export const canViewGlobalReports = (user: User | null) => canUser(user, "report:global");
export const canViewAudit = (user: User | null) => canUserAny(user, ["audit:view_shop", "audit:view_global"]);
