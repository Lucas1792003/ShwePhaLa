export type Role = "ADMIN" | "MANAGER" | "CASHIER" | "BUYER";
export type ProductCategory = string; // Dynamic categories
export type BarcodeType = "EAN13" | "CODE128" | "QR";

// Category entity for dynamic category management
export interface Category {
  id: string;
  name: string;
  color: "amber" | "red" | "green" | "blue" | "purple" | "slate" | "pink" | "teal" | "indigo" | "yellow" | "orange" | "cyan";
  /**
   * Category icon registry key (see src/features/categories/categoryIcons.ts).
   * Optional — older categories without it fall back to a name-based match.
   */
  iconKey?: string;
  isActive: boolean;
  createdAt: string;
}
export type PaymentMethod = "CASH" | "OTHER";
export type SaleStatus = "NORMAL" | "VOID" | "REFUNDED";
export type ApprovalStatus = "REQUESTED" | "APPROVED" | "REJECTED";

// Stock Movement Types (Ledger-Based)
export type StockMovementType =
  | "PURCHASE_IN"    // Stock received from supplier
  | "SALE_OUT"       // Stock sold to customer
  | "TRANSFER_OUT"   // Stock sent to another shop
  | "TRANSFER_IN"    // Stock received from another shop
  | "ADJUSTMENT"     // Manual stock correction
  | "DAMAGE"         // Damaged/expired stock write-off
  | "RETURN_IN"      // Customer return
  | "RETURN_OUT";    // Return to supplier

// Stock Transfer Status
export type TransferStatus = "PENDING" | "APPROVED" | "COMPLETED" | "CANCELED" | "REJECTED";

// Purchase Order Status
export type PurchaseOrderStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RECEIVED" | "CANCELED";

// ============================================
// Granular Permissions — single central registry.
// `Permission` is derived from ALL_PERMISSIONS so the runtime list and the
// type can never drift. Add new permissions here only.
// ============================================
export const ALL_PERMISSIONS = [
  // Shop Management
  "shop:create", "shop:read", "shop:update", "shop:delete",
  // User Management
  "user:create", "user:read", "user:update", "user:delete",
  // Product Management
  "product:create", "product:read", "product:update", "product:delete", "product:edit_price",
  "barcode:manage",
  // Inventory Management
  //   view_stock       = current on-hand availability (POS + stock list)
  //   view_movements   = stock movement / ledger history
  //   adjust / damage  = manual stock corrections / damage write-off
  //   override_negative = allow a manual adjustment to drive stock negative
  "inventory:view_stock", "inventory:view_movements", "inventory:adjust", "inventory:damage",
  "inventory:override_negative",
  // Stock Transfers
  "transfer:create", "transfer:approve", "transfer:cancel", "transfer:view",
  // POS / Sales
  //   request_refund / request_void = raise an approval request (cashier-level)
  //   refund / void_sale            = approve those requests (manager-level)
  //   sale:view          = full shop sales history
  //   sales:view_own_shift = the caller's own-shift sales (receipt access)
  "pos:create_sale", "pos:apply_discount", "pos:override_price", "pos:override_stock",
  "pos:void_sale", "pos:refund", "pos:request_refund", "pos:request_void",
  "sale:view", "sales:view_own_shift", "receipt:reprint",
  // Suppliers & Purchasing
  "supplier:create", "supplier:read", "supplier:update", "supplier:delete",
  "purchase:create", "purchase:approve", "purchase:receive", "purchase:view",
  // Pricing
  "pricing:manage",
  // Approvals
  "approval:view",
  // Shifts
  "shift:manage_own", "shift:manage_all", "shift:verify",
  // Reports
  //   own_shift   = a cashier's own shift summary
  //   shop_*      = assigned-shop reports (sales / inventory / profit)
  //   global      = cross-shop reporting. Profit/cost stays isolated in shop_profit.
  "report:own_shift", "report:shop_sales", "report:shop_inventory", "report:shop_profit",
  "report:global",
  // Audit
  "audit:view_shop", "audit:view_global",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export interface Shop {
  id: string;
  code: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  role: Role;
  shopId?: string;
  authId?: string; // Supabase Auth account link (auth.users.id)
  /**
   * @deprecated Legacy replacement-model permissions. Superseded by
   * grantedPermissions / revokedPermissions. Retained only so pre-migration
   * users keep their access until migration 002 backfills the new fields.
   */
  permissions?: Permission[];
  grantedPermissions?: Permission[]; // additive — granted on top of role defaults
  revokedPermissions?: Permission[]; // explicit denials — win over role default and grant
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  sku?: string;
  name: string;
  category: ProductCategory;
  unitType: "piece" | "box" | "kg" | "liter" | "pack";
  priceMmk: number;
  costMmk?: number;
  packSize?: number;
  lowStockThreshold: number;
  expiryDate?: string; // Optional expiry tracking
  imageUrl?: string; // Product image URL
  isActive: boolean;
  createdAt: string;
}

// Tier-Based Pricing (quantity-based price breaks)
export interface PriceTier {
  id: string;
  productId: string;
  shopId?: string; // null = applies to all shops
  minQty: number;  // Minimum quantity for this tier
  maxQty?: number; // Maximum quantity (null = unlimited)
  priceMmk: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

// Supplier Management
export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

// Purchase Order
export interface PurchaseOrder {
  id: string;
  orderNo: string;
  shopId: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  subtotalMmk: number;
  taxMmk?: number;
  totalMmk: number;
  notes?: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  orderedQty: number;
  receivedQty?: number;
  unitCostMmk: number;
  lineTotalMmk: number;
}

// Stock Transfer Between Shops
export interface StockTransfer {
  id: string;
  transferNo: string;
  fromShopId: string;
  toShopId: string;
  status: TransferStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  completedAt?: string;
  canceledBy?: string;
  canceledAt?: string;
  cancelReason?: string;
}

export interface StockTransferItem {
  id: string;
  transferId: string;
  productId: string;
  requestedQty: number;
  approvedQty?: number;
  transferredQty?: number;
}

export interface ProductBarcode {
  id: string;
  productId: string;
  value: string;
  type: BarcodeType;
}

export interface Inventory {
  shopId: string;
  productId: string;
  qtyBaseUnits: number;
  storageLocation?: string;
  lastCountedAt?: string;
}

// Ledger-Based Stock Movement - Every stock change MUST create a movement record
export interface InventoryMovement {
  id: string;
  shopId: string;
  productId: string;
  type: StockMovementType;
  qtyChange: number; // Positive = IN, Negative = OUT
  qtyBefore: number; // Stock level before this movement
  qtyAfter: number;  // Stock level after this movement
  reason: string;
  referenceType?: "sale" | "transfer" | "purchase" | "adjustment" | "damage";
  referenceId?: string; // ID of related sale/transfer/purchase
  createdBy: string;
  createdAt: string;
}

// Legacy movement type alias for backward compatibility
export type LegacyMovementType = "ADD" | "REMOVE" | "SET";

export interface Shift {
  id: string;
  shopId: string;
  cashierId: string;
  startedAt: string;
  endedAt?: string;
  openingCashMmk: number;
  closingCashMmk?: number;
  expectedCashMmk?: number;
  varianceMmk?: number;
  varianceReason?: string;
}

export interface Sale {
  id: string;
  shopId: string;
  shiftId: string;
  receiptNo: string;
  cashierId: string;
  status: SaleStatus;
  subtotalMmk: number;
  discountMmk: number;
  cartDiscountPct?: number;
  totalMmk: number;
  paymentMethod: PaymentMethod;
  paidMmk: number;
  changeMmk: number;
  createdAt: string;
}

export interface SaleItem {
  saleId: string;
  productId: string;
  qtyUnits: number;
  unitPriceMmk: number;
  itemDiscountPct?: number;
  lineTotalMmk: number;
  priceOverriddenBy?: string;
  unitLabel?: string;
  unitsPerItem?: number;
  stockOverrideBy?: string;
}

export interface ReprintLog {
  id: string;
  saleId: string;
  printedBy: string;
  printedAt: string;
}

export interface RefundVoidRequest {
  id: string;
  saleId: string;
  shopId: string;
  type: "VOID" | "PARTIAL";
  reason: string;
  createdBy: string;
  createdAt: string;
  items?: { productId: string; qtyUnits: number; amountMmk: number }[];
  status?: ApprovalStatus;
}

export interface AuditLog {
  id: string;
  shopId?: string;
  actorId: string;
  actionType: string;
  message: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  qty: number;
  unitPriceMmk: number;
  itemDiscountPct?: number;
  unitLabel?: string;
  unitsPerItem: number;
  priceOverriddenBy?: string;
  stockOverrideBy?: string;
  // Display fields
  imageUrl?: string;
  category?: ProductCategory;
}

export type Refund = RefundVoidRequest;

// ============================================
// Role-Permission Mapping (Default Permissions)
// MUST be kept in sync with role_default_permissions() in
// supabase/migrations/014_rbac_role_tuning.sql — the SQL function is the
// source of truth for RLS / RPC checks and this object for the frontend.
// Any change here requires a matching change there (and a new migration).
// ============================================
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // ADMIN always has every permission in the registry.
  ADMIN: [...ALL_PERMISSIONS],
  MANAGER: [
    // Shop-scoped management & operations for the assigned shop only.
    "shop:read",
    "user:read",
    "product:read", "product:update", "product:edit_price",
    "inventory:view_stock", "inventory:view_movements", "inventory:adjust", "inventory:damage",
    "inventory:override_negative",
    "transfer:create", "transfer:approve", "transfer:view",
    "pos:create_sale", "pos:apply_discount", "pos:override_price", "pos:override_stock",
    "pos:void_sale", "pos:refund", "pos:request_refund", "pos:request_void",
    "sale:view", "sales:view_own_shift", "receipt:reprint",
    "supplier:read",
    "purchase:create", "purchase:receive", "purchase:view",
    "approval:view",
    "shift:manage_own", "shift:manage_all", "shift:verify",
    // Operational shop reports only — profit/global stay ADMIN-only.
    "report:own_shift", "report:shop_sales", "report:shop_inventory",
    "audit:view_shop",
  ],
  CASHIER: [
    // POS-only: ring up sales, run own shift, raise (not approve) requests.
    "product:read",
    "inventory:view_stock",
    "pos:create_sale", "pos:apply_discount", "pos:request_refund", "pos:request_void",
    "sales:view_own_shift", "receipt:reprint",
    "shift:manage_own",
    "report:own_shift",
  ],
  BUYER: [
    // Limited catalog + purchasing role: browse catalog/suppliers and
    // create/view purchase orders. No approving, receiving or stock writes.
    "product:read",
    "supplier:read",
    "purchase:view", "purchase:create",
  ],
};

// Permission helper functions live in src/lib/permissions.ts (the central
// registry). They are kept out of this types file deliberately.
