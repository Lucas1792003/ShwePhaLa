/**
 * Central permission registry.
 *
 * This is the single source of truth for authorization helpers. The granular
 * `Permission` strings (e.g. "pos:create_sale") are the only permission system
 * — the old coarse system (VIEW_POS, MANAGE_PRODUCTS, ...) has been removed.
 *
 * Effective permission model:
 *   effective = roleDefaults  ∪  grantedPermissions  −  revokedPermissions
 * A revoke always wins over a role default and over a grant.
 */
import type { Permission, Role, User, Sale, StockTransfer, PurchaseOrder, PriceTier } from "../types";
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../types";

export type { Permission };
export { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS };

// ============================================================
// Route → permission registry
// Used by the router guard and the sidebar so both stay consistent.
// `satisfies` guarantees every value is a real granular permission.
// ============================================================
export const ROUTE_PERMISSIONS = {
  dashboard: "report:shop_sales",
  pos: "pos:create_sale",
  // Sales list: any caller with own-shift visibility can enter; the page narrows
  // to own-cashier rows for non-`sale:view` users, and the sales_sel RLS still
  // enforces row scope server-side (own cashier_id / own shift, or shop-wide
  // with `sale:view`, or all for ADMIN). See migration 015.
  sales: "sales:view_own_shift",
  saleDetail: "sales:view_own_shift",
  shifts: "shift:manage_own",
  inventory: "inventory:view_stock",
  transfers: "transfer:view",
  purchases: "purchase:view",
  approvals: "approval:view",
  // Label-printing page. Route is additionally role-gated to ADMIN +
  // MANAGER via `RequireRole allowed={[...]}`; cashier/buyer never see
  // this even though they hold `product:read`. The page is read-only
  // (no writes to product_barcodes), so no SQL/RLS change required.
  barcodeLabels: "product:read",
  reports: "report:shop_sales",
  reportsProfit: "report:shop_profit",
  catalog: "product:read",
  adminShops: "shop:create",
  adminUsers: "user:create",
  // Reading the admin products page only requires product:read. The router
  // layers an ADMIN/MANAGER role gate on this route, then the list/form gate
  // Add, Save, and Delete on product:create / product:update / product:delete.
  adminProducts: "product:read",
  adminProductCreate: "product:create",
  adminProductEdit: "product:update",
  adminUnitTypes: "product:create",
  adminBarcodes: "barcode:manage",
  adminSuppliers: "supplier:read",
  adminPricing: "pricing:manage",
  adminReports: "report:global",
  adminAudit: "audit:view_global",
  adminSecurity: "user:update",
  suppliers: "supplier:read",
  supplierDetail: "supplier:read",
} as const satisfies Record<string, Permission>;

// ============================================================
// Core permission helpers
// ============================================================

/** Default permissions for a role (no per-user grants/revokes applied). */
export function getRolePermissions(role: Role): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Effective permissions for a user:
 *   roleDefaults ∪ grantedPermissions − revokedPermissions
 *
 * Legacy safety net: a pre-migration user that still has the old replacement
 * `permissions` field and no grant/deny data keeps the old semantics until
 * migration 002 backfills grantedPermissions / revokedPermissions.
 */
export function getEffectivePermissions(user: User): Permission[] {
  const noGrantDenyData =
    user.grantedPermissions === undefined && user.revokedPermissions === undefined;
  if (noGrantDenyData && (user.permissions?.length ?? 0) > 0) {
    return [...new Set(user.permissions)];
  }

  const effective = new Set<Permission>(getRolePermissions(user.role));
  for (const p of user.grantedPermissions ?? []) effective.add(p);
  for (const p of user.revokedPermissions ?? []) effective.delete(p); // revoke wins
  return [...effective];
}

/** True if the (active) user holds the given permission. */
export function hasPermission(user: User | null | undefined, permission: Permission): boolean {
  if (!user || !user.isActive) return false;
  return getEffectivePermissions(user).includes(permission);
}

/** True if the user holds at least one of the given permissions. */
export function hasAnyPermission(user: User | null | undefined, permissions: Permission[]): boolean {
  if (!user || !user.isActive) return false;
  const effective = getEffectivePermissions(user);
  return permissions.some((p) => effective.includes(p));
}

/** True if the user holds every one of the given permissions. */
export function hasAllPermissions(user: User | null | undefined, permissions: Permission[]): boolean {
  if (!user || !user.isActive) return false;
  const effective = getEffectivePermissions(user);
  return permissions.every((p) => effective.includes(p));
}

// ============================================================
// Shop-aware helpers
// ============================================================

/**
 * Whether the user is allowed to act within a given shop.
 * ADMIN spans all shops; MANAGER / CASHIER / BUYER are limited to their own.
 */
export function canAccessShop(user: User | null | undefined, shopId: string): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === "ADMIN") return true;
  return user.shopId === shopId;
}

/**
 * Permission AND shop scope. Use this for any shop-scoped action — a matching
 * permission alone is not sufficient.
 */
export function hasShopPermission(
  user: User | null | undefined,
  permission: Permission,
  shopId: string
): boolean {
  return hasPermission(user, permission) && canAccessShop(user, shopId);
}

// ============================================================
// Workflow-specific helpers (permission + relevant shop scope)
// ============================================================

export function canVoidSale(user: User | null | undefined, sale: Sale): boolean {
  return hasShopPermission(user, "pos:void_sale", sale.shopId);
}

export function canRefundSale(user: User | null | undefined, sale: Sale): boolean {
  return hasShopPermission(user, "pos:refund", sale.shopId);
}

export function canAdjustInventory(user: User | null | undefined, shopId: string): boolean {
  return hasShopPermission(user, "inventory:adjust", shopId);
}

/** Transfer completion is actioned at the source shop. */
export function canCompleteTransfer(user: User | null | undefined, transfer: StockTransfer): boolean {
  return hasShopPermission(user, "transfer:approve", transfer.fromShopId);
}

export function canReceivePurchaseOrder(user: User | null | undefined, po: PurchaseOrder): boolean {
  return hasShopPermission(user, "purchase:receive", po.shopId);
}

export function canApprovePurchaseOrder(user: User | null | undefined, po: PurchaseOrder): boolean {
  return hasShopPermission(user, "purchase:approve", po.shopId);
}

export function canRecordSupplierPayment(user: User | null | undefined, po: PurchaseOrder): boolean {
  return hasShopPermission(user, "supplier:payment_create", po.shopId);
}

/**
 * Price tiers: a global tier (no shopId) needs only the manage permission;
 * a shop-scoped tier additionally requires access to that shop.
 */
export function canManagePriceTier(
  user: User | null | undefined,
  priceTierOrShopId: PriceTier | string | undefined
): boolean {
  const shopId =
    typeof priceTierOrShopId === "string" ? priceTierOrShopId : priceTierOrShopId?.shopId;
  if (!shopId) return hasPermission(user, "pricing:manage");
  return hasShopPermission(user, "pricing:manage", shopId);
}
