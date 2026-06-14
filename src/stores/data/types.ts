import type {
  AuditLog,
  Brand,
  CartItem,
  Category,
  Inventory,
  InventoryMovement,
  Product,
  ProductBarcode,
  ProductUnit,
  PriceTier,
  PurchaseOrder,
  PurchaseOrderItem,
  Refund,
  Sale,
  SaleItem,
  Shift,
  Shop,
  StockTransfer,
  StockTransferItem,
  StockMovementType,
  PriceLevel,
  ProductUnitPrice,
  Supplier,
  SupplierPayment,
  SupplierPaymentMethod,
  SupplierProduct,
  UnitType,
  User,
} from "../../types";

// ============================================
// Input Types for Actions
// ============================================

export interface CreateSaleInput {
  shopId: string;
  cashierId: string;
  shiftId: string;
  cartItems: CartItem[];
  cartDiscountPct: number;
  paymentMethod: "CASH" | "OTHER";
  paidMmk: number;
}

export interface RefundItemInput {
  productId: string;
  qtyUnits: number;
  amountMmk: number;
}

export interface CreateTransferInput {
  fromShopId: string;
  toShopId: string;
  items: {
    productId: string;
    /** Legacy base-unit path. New transfer UI sends productUnitId + selectedUnitQuantity. */
    requestedQty?: number;
    productUnitId?: string;
    selectedUnitQuantity?: number;
  }[];
  notes?: string;
  createdBy: string;
}

export interface CreatePurchaseOrderInput {
  shopId: string;
  supplierId: string;
  items: { productId: string; orderedQty: number; unitCostMmk: number }[];
  notes?: string;
  createdBy: string;
}

export interface AdjustStockInput {
  shopId: string;
  productId: string;
  type: StockMovementType;
  /** Signed base-unit delta. Negative for DAMAGE / ADJUSTMENT-out, positive
   *  for stock-in. When `productUnitId` is provided, the server replaces
   *  the magnitude with `unitQty * unit.base_quantity` and keeps the sign
   *  from this field. Pass ±1 as a direction hint in the unit-aware path. */
  qtyChange: number;
  reason: string;
  actorId: string;
  referenceType?: "sale" | "transfer" | "purchase" | "adjustment" | "damage";
  referenceId?: string;
  /** Unit-aware adjustment (migration 028). When set, server computes
   *  base delta from `unitQty * product_unit.base_quantity`. */
  productUnitId?: string;
  unitQty?: number;
}

// ============================================
// State Slices
// ============================================

export interface ShopState {
  shops: Shop[];
  users: User[];
  addShop: (shop: Shop) => Promise<void>;
  updateShop: (shop: Shop) => Promise<void>;
  deleteShop: (shopId: string) => Promise<void>;
  addUser: (user: User) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

export interface CategoryState {
  categories: Category[];
  addCategory: (category: Category) => void;
  updateCategory: (category: Category) => void;
  deleteCategory: (categoryId: string) => void;
}

export interface BrandState {
  brands: Brand[];
  addBrand: (brand: Brand) => Promise<void>;
  updateBrand: (brand: Brand) => Promise<void>;
  /**
   * Soft delete — flips is_active=false. Throws a friendly error if any
   * product still references the brand so callers can surface it inline.
   */
  deactivateBrand: (brandId: string) => Promise<void>;
}

export interface UnitTypeState {
  unitTypes: UnitType[];
  addUnitType: (unitType: UnitType) => void;
  updateUnitType: (unitType: UnitType) => void;
  /** Soft delete — flips is_active to false. Hard delete is not exposed. */
  deactivateUnitType: (unitTypeId: string) => void;
}

export interface PriceLevelState {
  priceLevels: PriceLevel[];
  productUnitPrices: ProductUnitPrice[];
  /**
   * Replace the active per-level prices for a product unit. Inactive
   * legacy rows are flipped to is_active=false. `shopId === undefined`
   * means a global row.
   */
  replaceProductUnitPrices: (
    productUnitId: string,
    prices: { priceLevelId: string; shopId?: string; priceMmk: number }[],
  ) => Promise<void>;
}

export interface ProductState {
  products: Product[];
  productUnits: ProductUnit[];
  barcodes: ProductBarcode[];
  /** Many-to-many supplier⇄product links (which products each supplier sells). */
  supplierProducts: SupplierProduct[];
  addProduct: (product: Product, barcodes: ProductBarcode[]) => Promise<void>;
  updateProduct: (product: Product, barcodes: ProductBarcode[]) => Promise<void>;
  /**
   * Hard delete a product. Removes the row from `products` and any
   * inventory rows for it (the `inventory.product_id` FK has no CASCADE).
   * `product_barcodes` and `price_tiers` cascade-delete automatically.
   * Throws on DB failure so the caller can surface it.
   */
  deleteProduct: (productId: string) => Promise<void>;
  /**
   * Async barcode reconcile that throws on DB failure (incl. the unique
   * `product_barcodes_unique_normalized_value` index). Used by the
   * product form to surface duplicate-barcode errors inline instead of
   * the fire-and-forget toast `addProduct`/`updateProduct` emit.
   */
  replaceProductBarcodes: (productId: string, barcodes: ProductBarcode[]) => Promise<void>;
  replaceProductUnits: (productId: string, units: ProductUnit[]) => Promise<void>;
  /**
   * Reconcile the supplier links for a product (delete-then-insert). Throws on
   * DB failure so the product form can surface it. Managed from the product
   * form; gated server-side on product:create/product:update.
   */
  replaceProductSuppliers: (productId: string, supplierIds: string[]) => Promise<void>;
  /** Link one or more products to a supplier (supplier-side, skips existing). */
  addSupplierProducts: (supplierId: string, productIds: string[]) => Promise<void>;
  /** Unlink a single product from a supplier. */
  removeSupplierProduct: (supplierId: string, productId: string) => Promise<void>;
  getProductByBarcode: (value: string) => { product: Product; unit: ProductUnit } | undefined;
}

export interface InventoryState {
  inventory: Inventory[];
  movements: InventoryMovement[];
  adjustStock: (input: AdjustStockInput) => Promise<void>;
  recordDamage: (input: { shopId: string; productId: string; qty: number; reason: string; actorId: string }) => Promise<void>;
  getInventoryQty: (shopId: string, productId: string) => number;
}

export interface ShiftState {
  shifts: Shift[];
  startShift: (input: { shopId: string; cashierId: string; openingCashMmk: number }) => Promise<string>;
  endShift: (input: { shiftId: string; closingCashMmk: number; varianceReason?: string }) => Promise<void>;
  requireShiftForCashier: (shopId: string, cashierId: string) => Shift | undefined;
}

export interface SaleState {
  sales: Sale[];
  saleItems: SaleItem[];
  refunds: Refund[];
  refundVoidRequests: Refund[];
  createSale: (input: CreateSaleInput) => Promise<string>;
  voidSale: (input: { saleId: string; reason: string; actorId: string }) => Promise<void>;
  requestVoid: (input: { saleId: string; reason: string; actorId: string }) => Promise<void>;
  requestRefund: (input: { saleId: string; items: RefundItemInput[]; reason: string; actorId: string }) => Promise<void>;
  approveRefund: (input: { refundId: string; approverId: string }) => Promise<void>;
}

export interface TransferState {
  stockTransfers: StockTransfer[];
  stockTransferItems: StockTransferItem[];
  createTransfer: (input: CreateTransferInput) => Promise<string>;
  approveTransfer: (input: { transferId: string; approverId: string; approvedItems?: { productId: string; approvedQty: number }[] }) => Promise<void>;
  rejectTransfer: (input: { transferId: string; actorId: string; reason: string }) => Promise<void>;
  /** Source marks an APPROVED transfer IN_TRANSIT (no inventory change yet). */
  dispatchTransfer: (input: { transferId: string; actorId: string }) => Promise<void>;
  /**
   * Destination confirms receipt of an IN_TRANSIT transfer, moving stock
   * (source → dest) for the received quantities. `receivedItems` lets the
   * destination record a short receipt (per-line base qty ≤ approved); when
   * omitted, the full approved quantity is received.
   */
  receiveTransfer: (input: {
    transferId: string;
    actorId: string;
    receivedItems?: { productId: string; receivedQty: number }[];
  }) => Promise<void>;
  cancelTransfer: (input: { transferId: string; actorId: string; reason: string }) => Promise<void>;
  getTransfersByShop: (shopId: string) => StockTransfer[];
  getPendingTransfersForApproval: (shopId: string) => StockTransfer[];
}

export interface PurchaseState {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderItems: PurchaseOrderItem[];
  supplierPayments: SupplierPayment[];
  addSupplier: (supplier: Supplier) => Promise<void>;
  updateSupplier: (supplier: Supplier) => Promise<void>;
  createPurchaseOrder: (input: CreatePurchaseOrderInput) => Promise<string>;
  approvePurchaseOrder: (input: { purchaseOrderId: string; approverId: string }) => Promise<void>;
  /**
   * Receive a purchase order. Each item may pass either the legacy
   * `receivedQty` (base units) OR the unit-aware pair
   * `{ productUnitId, receivedUnitQty }`. The RPC computes base qty from
   * the unit pair server-side (migration 028).
   */
  receivePurchaseOrder: (input: {
    purchaseOrderId: string;
    receiverId: string;
    receivedItems: {
      productId: string;
      receivedQty?: number;
      productUnitId?: string;
      receivedUnitQty?: number;
    }[];
  }) => Promise<void>;
  cancelPurchaseOrder: (input: { purchaseOrderId: string; actorId: string }) => Promise<void>;
  recordSupplierPayment: (input: {
    purchaseOrderId: string;
    amountMmk: number;
    paymentMethod: SupplierPaymentMethod;
    referenceNo?: string;
    notes?: string;
  }) => Promise<void>;
}

export interface PricingState {
  priceTiers: PriceTier[];
  addPriceTier: (tier: PriceTier) => Promise<void>;
  updatePriceTier: (tier: PriceTier) => Promise<void>;
  deletePriceTier: (tierId: string) => Promise<void>;
  getProductPrice: (productId: string, shopId: string, qty: number) => number;
}

export interface AuditState {
  auditLogs: AuditLog[];
  reprintLogs: { id: string; saleId: string; printedBy: string; printedAt: string }[];
  addAuditLog: (log: AuditLog) => Promise<void>;
  addReprintLog: (input: { saleId: string; actorId: string }) => Promise<void>;
}

// ============================================
// Loading State
// ============================================

export interface LoadingState {
  isLoading: boolean;
  isLoaded: boolean;
  loadError: string | null;
  loadData: (options?: { force?: boolean }) => Promise<void>;
  retryLoadData: () => Promise<void>;
}

// ============================================
// Combined State
// ============================================

export type DataState = ShopState &
  CategoryState &
  BrandState &
  UnitTypeState &
  ProductState &
  PriceLevelState &
  InventoryState &
  ShiftState &
  SaleState &
  TransferState &
  PurchaseState &
  PricingState &
  AuditState &
  LoadingState;
