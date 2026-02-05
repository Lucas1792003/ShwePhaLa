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
  addShop: (shop: Shop) => void;
  updateShop: (shop: Shop) => void;
  addUser: (user: User) => void;
  updateUser: (user: User) => void;
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
  getProductByBarcode: (value: string) => Product | undefined;
}

export interface InventoryState {
  inventory: Inventory[];
  movements: InventoryMovement[];
  adjustStock: (input: AdjustStockInput) => void;
  recordDamage: (input: { shopId: string; productId: string; qty: number; reason: string; actorId: string }) => void;
  getInventoryQty: (shopId: string, productId: string) => number;
}

export interface ShiftState {
  shifts: Shift[];
  startShift: (input: { shopId: string; cashierId: string; openingCashMmk: number }) => string;
  endShift: (input: { shiftId: string; closingCashMmk: number }) => void;
  requireShiftForCashier: (shopId: string, cashierId: string) => Shift | undefined;
}

export interface SaleState {
  sales: Sale[];
  saleItems: SaleItem[];
  refunds: Refund[];
  refundVoidRequests: Refund[];
  createSale: (input: CreateSaleInput) => string;
  voidSale: (input: { saleId: string; reason: string; actorId: string }) => void;
  requestVoid: (input: { saleId: string; reason: string; actorId: string }) => void;
  requestRefund: (input: { saleId: string; items: RefundItemInput[]; reason: string; actorId: string }) => void;
  approveRefund: (input: { refundId: string; approverId: string }) => void;
}

export interface TransferState {
  stockTransfers: StockTransfer[];
  stockTransferItems: StockTransferItem[];
  createTransfer: (input: CreateTransferInput) => string;
  approveTransfer: (input: { transferId: string; approverId: string; approvedItems?: { productId: string; approvedQty: number }[] }) => void;
  rejectTransfer: (input: { transferId: string; actorId: string; reason: string }) => void;
  completeTransfer: (input: { transferId: string; actorId: string }) => void;
  cancelTransfer: (input: { transferId: string; actorId: string; reason: string }) => void;
  getTransfersByShop: (shopId: string) => StockTransfer[];
  getPendingTransfersForApproval: (shopId: string) => StockTransfer[];
}

export interface PurchaseState {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderItems: PurchaseOrderItem[];
  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (supplier: Supplier) => void;
  createPurchaseOrder: (input: CreatePurchaseOrderInput) => string;
  approvePurchaseOrder: (input: { purchaseOrderId: string; approverId: string }) => void;
  receivePurchaseOrder: (input: { purchaseOrderId: string; receiverId: string; receivedItems: { productId: string; receivedQty: number }[] }) => void;
  cancelPurchaseOrder: (input: { purchaseOrderId: string; actorId: string }) => void;
}

export interface PricingState {
  priceTiers: PriceTier[];
  addPriceTier: (tier: PriceTier) => void;
  updatePriceTier: (tier: PriceTier) => void;
  deletePriceTier: (tierId: string) => void;
  getProductPrice: (productId: string, shopId: string, qty: number) => number;
}

export interface AuditState {
  auditLogs: AuditLog[];
  reprintLogs: { id: string; saleId: string; printedBy: string; printedAt: string }[];
  addAuditLog: (log: AuditLog) => void;
  addReprintLog: (input: { saleId: string; actorId: string }) => void;
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
  AuditState;
