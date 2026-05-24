import type {
  AuditLog,
  CartItem,
  Category,
  Inventory,
  InventoryMovement,
  Product,
  ProductBarcode,
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
  Supplier,
  SupplierPayment,
  SupplierPaymentMethod,
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
  items: { productId: string; requestedQty: number }[];
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
  qtyChange: number;
  reason: string;
  actorId: string;
  referenceType?: "sale" | "transfer" | "purchase" | "adjustment" | "damage";
  referenceId?: string;
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

export interface ProductState {
  products: Product[];
  barcodes: ProductBarcode[];
  addProduct: (product: Product, barcodes: ProductBarcode[]) => void;
  updateProduct: (product: Product, barcodes: ProductBarcode[]) => void;
  /**
   * Async barcode reconcile that throws on DB failure (incl. the unique
   * `product_barcodes_unique_normalized_value` index). Used by the
   * product form to surface duplicate-barcode errors inline instead of
   * the fire-and-forget toast `addProduct`/`updateProduct` emit.
   */
  replaceProductBarcodes: (productId: string, barcodes: ProductBarcode[]) => Promise<void>;
  getProductByBarcode: (value: string) => Product | undefined;
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
  completeTransfer: (input: { transferId: string; actorId: string }) => Promise<void>;
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
  receivePurchaseOrder: (input: { purchaseOrderId: string; receiverId: string; receivedItems: { productId: string; receivedQty: number }[] }) => Promise<void>;
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
  ProductState &
  InventoryState &
  ShiftState &
  SaleState &
  TransferState &
  PurchaseState &
  PricingState &
  AuditState &
  LoadingState;
