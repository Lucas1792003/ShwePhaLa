export type Role = "ADMIN" | "MANAGER" | "CASHIER" | "BUYER";
export type ProductCategory = string; // Dynamic categories
export type BarcodeType = "EAN13" | "CODE128" | "QR";

// Category entity for dynamic category management
export interface Category {
  id: string;
  name: string;
  color: "amber" | "red" | "green" | "blue" | "purple" | "slate" | "pink" | "teal" | "indigo" | "yellow" | "orange" | "cyan";
  isActive: boolean;
  createdAt: string;
}
export type PaymentMethod = "CASH" | "OTHER";
export type SaleStatus = "NORMAL" | "VOID" | "REFUNDED";
export type ApprovalStatus = "REQUESTED" | "APPROVED";

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

// Granular Permissions
export type Permission =
  // Shop Management
  | "shop:create"
  | "shop:read"
  | "shop:update"
  | "shop:delete"
  // User Management
  | "user:create"
  | "user:read"
  | "user:update"
  | "user:delete"
  // Product Management
  | "product:create"
  | "product:read"
  | "product:update"
  | "product:delete"
  | "product:edit_price"
  // Inventory Management
  | "inventory:read"
  | "inventory:adjust"
  | "inventory:damage"
  // Stock Transfers
  | "transfer:create"
  | "transfer:approve"
  | "transfer:cancel"
  | "transfer:view"
  // POS / Sales
  | "pos:create_sale"
  | "pos:apply_discount"
  | "pos:override_price"
  | "pos:override_stock"
  | "pos:void_sale"
  | "pos:refund"
  // Suppliers & Purchasing
  | "supplier:create"
  | "supplier:read"
  | "supplier:update"
  | "supplier:delete"
  | "purchase:create"
  | "purchase:approve"
  | "purchase:receive"
  // Shifts
  | "shift:manage_own"
  | "shift:manage_all"
  | "shift:verify"
  // Reports
  | "report:shop"
  | "report:global"
  | "report:profit"
  // Audit
  | "audit:view_shop"
  | "audit:view_global";

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
  permissions?: Permission[]; // Custom permissions override
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
// ============================================
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    // Full access to everything
    "shop:create", "shop:read", "shop:update", "shop:delete",
    "user:create", "user:read", "user:update", "user:delete",
    "product:create", "product:read", "product:update", "product:delete", "product:edit_price",
    "inventory:read", "inventory:adjust", "inventory:damage",
    "transfer:create", "transfer:approve", "transfer:cancel", "transfer:view",
    "pos:create_sale", "pos:apply_discount", "pos:override_price", "pos:override_stock", "pos:void_sale", "pos:refund",
    "supplier:create", "supplier:read", "supplier:update", "supplier:delete",
    "purchase:create", "purchase:approve", "purchase:receive",
    "shift:manage_own", "shift:manage_all", "shift:verify",
    "report:shop", "report:global", "report:profit",
    "audit:view_shop", "audit:view_global",
  ],
  MANAGER: [
    // Shop-level management
    "shop:read",
    "user:read",
    "product:read", "product:update", "product:edit_price",
    "inventory:read", "inventory:adjust", "inventory:damage",
    "transfer:create", "transfer:approve", "transfer:view",
    "pos:create_sale", "pos:apply_discount", "pos:override_price", "pos:override_stock", "pos:void_sale", "pos:refund",
    "supplier:read",
    "purchase:create", "purchase:receive",
    "shift:manage_own", "shift:manage_all", "shift:verify",
    "report:shop", "report:profit",
    "audit:view_shop",
  ],
  CASHIER: [
    // POS operations only
    "product:read",
    "inventory:read",
    "transfer:view",
    "pos:create_sale", "pos:apply_discount",
    "shift:manage_own",
    "report:shop",
  ],
  BUYER: [
    // Read-only catalog access
    "product:read",
  ],
};

// Helper function to check if a user has a specific permission
export function hasPermission(user: User, permission: Permission): boolean {
  // Check custom permissions first
  if (user.permissions && user.permissions.length > 0) {
    return user.permissions.includes(permission);
  }
  // Fall back to default role permissions
  return DEFAULT_ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

// Helper function to get all permissions for a user
export function getUserPermissions(user: User): Permission[] {
  if (user.permissions && user.permissions.length > 0) {
    return user.permissions;
  }
  return DEFAULT_ROLE_PERMISSIONS[user.role] ?? [];
}
