import type {
  AuditLog,
  Category,
  Inventory,
  InventoryMovement,
  PriceTier,
  Product,
  ProductBarcode,
  ProductUnit,
  PurchaseOrder,
  PurchaseOrderItem,
  RefundVoidRequest,
  Sale,
  SaleItem,
  Shift,
  Shop,
  StockTransfer,
  StockTransferItem,
  Supplier,
  SupplierPayment,
  User,
} from "../../src/types";

const dayAgo = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

export const seedShops: Shop[] = [
  {
    id: "shop-a",
    code: "A",
    name: "Shwe Phala - Shop A",
    address: "Downtown Market Street",
    phone: "09-123456789",
    email: "shopa@shwephala.com",
    isActive: true,
    createdAt: dayAgo,
  },
  {
    id: "shop-b",
    code: "B",
    name: "Shwe Phala - Shop B",
    address: "Riverside Block 3",
    phone: "09-987654321",
    email: "shopb@shwephala.com",
    isActive: true,
    createdAt: dayAgo,
  },
];

export const seedUsers: User[] = [
  { id: "user-admin", name: "Nandar (Admin)", email: "nandar@admin.com", role: "ADMIN", isActive: true, createdAt: dayAgo },
  { id: "user-manager-a", name: "Ko Zaw (Manager A)", email: "kozaw@manager.com", role: "MANAGER", shopId: "shop-a", isActive: true, createdAt: dayAgo },
  { id: "user-manager-b", name: "Ma Thida (Manager B)", email: "mathida@manager.com", role: "MANAGER", shopId: "shop-b", isActive: true, createdAt: dayAgo },
  { id: "user-cashier-a", name: "Aye Aye (Cashier A)", email: "ayeaye@staff.com", role: "CASHIER", shopId: "shop-a", isActive: true, createdAt: dayAgo },
  { id: "user-cashier-b", name: "Tun Tun (Cashier B)", email: "tuntun@staff.com", role: "CASHIER", shopId: "shop-b", isActive: true, createdAt: dayAgo },
  { id: "user-buyer", name: "May (Buyer)", email: "may@buyer.com", role: "BUYER", isActive: true, createdAt: dayAgo },
];

// ============================================
// SUPPLIERS
// ============================================
export const seedSuppliers: Supplier[] = [
  {
    id: "supplier-01",
    code: "SUP-001",
    name: "Myanmar Beverage Co.",
    contactPerson: "U Aung",
    phone: "09-111222333",
    email: "orders@myanmarbev.com",
    address: "Industrial Zone, Yangon",
    notes: "Main beer and soft drinks supplier",
    isActive: true,
    createdAt: dayAgo,
  },
  {
    id: "supplier-02",
    code: "SUP-002",
    name: "Golden Spirits Ltd.",
    contactPerson: "Daw Mya",
    phone: "09-444555666",
    email: "sales@goldenspirits.com",
    address: "Mandalay Highway",
    notes: "Premium alcohol and wine supplier",
    isActive: true,
    createdAt: dayAgo,
  },
  {
    id: "supplier-03",
    code: "SUP-003",
    name: "Fresh Juice Factory",
    contactPerson: "Ko Win",
    phone: "09-777888999",
    email: "supply@freshjuice.com",
    address: "Bago Region",
    notes: "Juice and soft drinks",
    isActive: true,
    createdAt: dayAgo,
  },
];

export const seedProducts: Product[] = [
  // Beer products
  { id: "prod-beer-01", sku: "BEER-001", name: "Myanmar Lager Can", category: "beer", unitType: "piece", priceMmk: 2200, costMmk: 1600, packSize: 6, lowStockThreshold: 24, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-02", sku: "BEER-002", name: "Myanmar Lager Bottle", category: "beer", unitType: "piece", priceMmk: 2100, costMmk: 1500, packSize: 12, lowStockThreshold: 18, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-03", sku: "BEER-003", name: "Golden Pilsner", category: "beer", unitType: "piece", priceMmk: 2400, costMmk: 1700, packSize: 6, lowStockThreshold: 18, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-04", sku: "BEER-004", name: "Amber Draft", category: "beer", unitType: "piece", priceMmk: 2500, costMmk: 1750, packSize: 12, lowStockThreshold: 20, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-05", sku: "BEER-005", name: "Sunset Wheat", category: "beer", unitType: "piece", priceMmk: 2300, costMmk: 1650, lowStockThreshold: 16, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-06", sku: "BEER-006", name: "Mountain Stout", category: "beer", unitType: "piece", priceMmk: 2600, costMmk: 1850, packSize: 6, lowStockThreshold: 12, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-07", sku: "BEER-007", name: "River IPA", category: "beer", unitType: "piece", priceMmk: 2800, costMmk: 2000, packSize: 6, lowStockThreshold: 12, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-08", sku: "BEER-008", name: "Classic Lager 500ml", category: "beer", unitType: "piece", priceMmk: 2700, costMmk: 1950, packSize: 6, lowStockThreshold: 14, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-09", sku: "BEER-009", name: "Night Porter", category: "beer", unitType: "piece", priceMmk: 2900, costMmk: 2100, lowStockThreshold: 10, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-10", sku: "BEER-010", name: "Light Draft", category: "beer", unitType: "piece", priceMmk: 2000, costMmk: 1400, packSize: 12, lowStockThreshold: 22, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-11", sku: "BEER-011", name: "Premium Draft Bottle", category: "beer", unitType: "piece", priceMmk: 2600, costMmk: 1900, packSize: 12, lowStockThreshold: 18, isActive: true, createdAt: dayAgo },
  { id: "prod-beer-12", sku: "BEER-012", name: "Seasonal Ale", category: "beer", unitType: "piece", priceMmk: 3100, costMmk: 2300, lowStockThreshold: 10, isActive: true, createdAt: dayAgo },

  // Alcohol products
  { id: "prod-alc-01", sku: "ALC-001", name: "Classic Rum 375ml", category: "alcohol", unitType: "piece", priceMmk: 12000, costMmk: 9000, lowStockThreshold: 6, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-02", sku: "ALC-002", name: "Whiskey Gold 700ml", category: "alcohol", unitType: "piece", priceMmk: 24000, costMmk: 18000, lowStockThreshold: 4, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-03", sku: "ALC-003", name: "Silver Gin 700ml", category: "alcohol", unitType: "piece", priceMmk: 21000, costMmk: 16000, lowStockThreshold: 5, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-04", sku: "ALC-004", name: "Dry Vodka 500ml", category: "alcohol", unitType: "piece", priceMmk: 18000, costMmk: 13500, lowStockThreshold: 5, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-05", sku: "ALC-005", name: "Rice Wine 750ml", category: "alcohol", unitType: "piece", priceMmk: 15000, costMmk: 11000, lowStockThreshold: 6, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-06", sku: "ALC-006", name: "Plum Wine 500ml", category: "alcohol", unitType: "piece", priceMmk: 17000, costMmk: 12500, lowStockThreshold: 5, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-07", sku: "ALC-007", name: "Brandy Reserve 700ml", category: "alcohol", unitType: "piece", priceMmk: 26000, costMmk: 19500, lowStockThreshold: 4, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-08", sku: "ALC-008", name: "Spiced Rum 700ml", category: "alcohol", unitType: "piece", priceMmk: 22000, costMmk: 16500, lowStockThreshold: 4, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-09", sku: "ALC-009", name: "Herbal Liqueur 500ml", category: "alcohol", unitType: "piece", priceMmk: 19000, costMmk: 14000, lowStockThreshold: 5, isActive: true, createdAt: dayAgo },
  { id: "prod-alc-10", sku: "ALC-010", name: "Sake Classic 720ml", category: "alcohol", unitType: "piece", priceMmk: 20000, costMmk: 15000, lowStockThreshold: 4, isActive: true, createdAt: dayAgo },

  // Juice products
  { id: "prod-juice-01", sku: "JUI-001", name: "Orange Burst 1L", category: "juice", unitType: "piece", priceMmk: 1800, costMmk: 1200, packSize: 12, lowStockThreshold: 20, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-02", sku: "JUI-002", name: "Lime Soda 330ml", category: "juice", unitType: "piece", priceMmk: 900, costMmk: 550, packSize: 24, lowStockThreshold: 30, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-03", sku: "JUI-003", name: "Mango Nectar 1L", category: "juice", unitType: "piece", priceMmk: 1900, costMmk: 1300, packSize: 12, lowStockThreshold: 18, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-04", sku: "JUI-004", name: "Apple Fresh 1L", category: "juice", unitType: "piece", priceMmk: 1700, costMmk: 1150, packSize: 12, lowStockThreshold: 18, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-05", sku: "JUI-005", name: "Grape Splash 500ml", category: "juice", unitType: "piece", priceMmk: 1300, costMmk: 900, packSize: 12, lowStockThreshold: 24, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-06", sku: "JUI-006", name: "Pineapple Twist 1L", category: "juice", unitType: "piece", priceMmk: 1850, costMmk: 1250, packSize: 12, lowStockThreshold: 18, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-07", sku: "JUI-007", name: "Berry Mix 300ml", category: "juice", unitType: "piece", priceMmk: 1100, costMmk: 750, packSize: 24, lowStockThreshold: 24, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-08", sku: "JUI-008", name: "Coconut Water 350ml", category: "juice", unitType: "piece", priceMmk: 1400, costMmk: 980, packSize: 24, lowStockThreshold: 20, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-09", sku: "JUI-009", name: "Watermelon Chill 500ml", category: "juice", unitType: "piece", priceMmk: 1500, costMmk: 1000, packSize: 12, lowStockThreshold: 20, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-10", sku: "JUI-010", name: "Lemon Tea 450ml", category: "juice", unitType: "piece", priceMmk: 1200, costMmk: 820, packSize: 12, lowStockThreshold: 22, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-11", sku: "JUI-011", name: "Peach Iced Tea 450ml", category: "juice", unitType: "piece", priceMmk: 1250, costMmk: 850, packSize: 12, lowStockThreshold: 22, isActive: true, createdAt: dayAgo },
  { id: "prod-juice-12", sku: "JUI-012", name: "Guava Juice 1L", category: "juice", unitType: "piece", priceMmk: 1750, costMmk: 1180, packSize: 12, lowStockThreshold: 18, isActive: true, createdAt: dayAgo },
];

// ============================================
// TIER-BASED PRICING (Quantity Discounts)
// ============================================
export const seedPriceTiers: PriceTier[] = [
  // Myanmar Lager Can - bulk pricing
  { id: "tier-001", productId: "prod-beer-01", minQty: 1, maxQty: 5, priceMmk: 2200, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },
  { id: "tier-002", productId: "prod-beer-01", minQty: 6, maxQty: 11, priceMmk: 2100, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },
  { id: "tier-003", productId: "prod-beer-01", minQty: 12, maxQty: 23, priceMmk: 2000, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },
  { id: "tier-004", productId: "prod-beer-01", minQty: 24, priceMmk: 1900, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },

  // Lime Soda - bulk pricing
  { id: "tier-005", productId: "prod-juice-02", minQty: 1, maxQty: 11, priceMmk: 900, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },
  { id: "tier-006", productId: "prod-juice-02", minQty: 12, maxQty: 23, priceMmk: 850, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },
  { id: "tier-007", productId: "prod-juice-02", minQty: 24, priceMmk: 800, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },

  // Whiskey Gold - shop-specific pricing for Shop A
  { id: "tier-008", productId: "prod-alc-02", shopId: "shop-a", minQty: 1, maxQty: 2, priceMmk: 24000, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },
  { id: "tier-009", productId: "prod-alc-02", shopId: "shop-a", minQty: 3, priceMmk: 22000, isActive: true, createdAt: dayAgo, createdBy: "user-admin" },
];

const makeBarcode = (productId: string, value: string, type: "EAN13" | "CODE128" | "QR") => ({
  id: `bc-${value}`,
  productId,
  value,
  type,
});

export const seedBarcodes: ProductBarcode[] = [
  makeBarcode("prod-beer-01", "8850123456701", "EAN13"),
  makeBarcode("prod-beer-01", "INT-BEER-001", "CODE128"),
  makeBarcode("prod-beer-02", "8850123456702", "EAN13"),
  makeBarcode("prod-beer-03", "INT-BEER-003", "CODE128"),
  makeBarcode("prod-beer-04", "8850123456704", "EAN13"),
  makeBarcode("prod-beer-05", "INT-BEER-005", "CODE128"),
  makeBarcode("prod-beer-06", "8850123456706", "EAN13"),
  makeBarcode("prod-beer-07", "8850123456707", "EAN13"),
  makeBarcode("prod-beer-07", "IPA-QR-007", "QR"),
  makeBarcode("prod-beer-08", "INT-BEER-008", "CODE128"),
  makeBarcode("prod-beer-09", "8850123456709", "EAN13"),
  makeBarcode("prod-beer-10", "8850123456710", "EAN13"),
  makeBarcode("prod-beer-11", "8850123456711", "EAN13"),
  makeBarcode("prod-beer-12", "INT-BEER-012", "CODE128"),

  makeBarcode("prod-alc-01", "8850123456721", "EAN13"),
  makeBarcode("prod-alc-01", "INT-ALC-001", "CODE128"),
  makeBarcode("prod-alc-02", "8850123456722", "EAN13"),
  makeBarcode("prod-alc-03", "8850123456723", "EAN13"),
  makeBarcode("prod-alc-04", "INT-ALC-004", "CODE128"),
  makeBarcode("prod-alc-05", "8850123456725", "EAN13"),
  makeBarcode("prod-alc-06", "8850123456726", "EAN13"),
  makeBarcode("prod-alc-07", "INT-ALC-007", "CODE128"),
  makeBarcode("prod-alc-08", "8850123456728", "EAN13"),
  makeBarcode("prod-alc-09", "8850123456729", "EAN13"),
  makeBarcode("prod-alc-10", "SAKE-QR-010", "QR"),

  makeBarcode("prod-juice-01", "8850123456731", "EAN13"),
  makeBarcode("prod-juice-01", "INT-JUI-001", "CODE128"),
  makeBarcode("prod-juice-02", "8850123456732", "EAN13"),
  makeBarcode("prod-juice-03", "8850123456733", "EAN13"),
  makeBarcode("prod-juice-04", "INT-JUI-004", "CODE128"),
  makeBarcode("prod-juice-05", "8850123456735", "EAN13"),
  makeBarcode("prod-juice-06", "8850123456736", "EAN13"),
  makeBarcode("prod-juice-07", "JUI-QR-007", "QR"),
  makeBarcode("prod-juice-08", "8850123456738", "EAN13"),
  makeBarcode("prod-juice-09", "8850123456739", "EAN13"),
  makeBarcode("prod-juice-10", "INT-JUI-010", "CODE128"),
  makeBarcode("prod-juice-11", "8850123456741", "EAN13"),
  makeBarcode("prod-juice-12", "8850123456742", "EAN13"),
];

export const seedProductUnits: ProductUnit[] = seedProducts.map((product, index) => ({
  id: `unit-${product.id}-default`,
  productId: product.id,
  name: product.unitType || "Piece",
  baseQuantity: 1,
  salePriceMmk: product.priceMmk,
  purchasePriceMmk: product.costMmk,
  isDefault: true,
  isActive: true,
  sortOrder: index,
  createdAt: product.createdAt,
  updatedAt: product.createdAt,
}));

export const seedInventory: Inventory[] = seedShops.flatMap((shop, index) =>
  seedProducts.map((product, idx) => ({
    shopId: shop.id,
    productId: product.id,
    qtyBaseUnits: product.category === "alcohol" ? 6 + index * 2 : 40 + (idx % 8) * 6,
  }))
);

export const seedMovements: InventoryMovement[] = [
  {
    id: "move-01",
    shopId: "shop-a",
    productId: "prod-juice-01",
    type: "PURCHASE_IN",
    qtyChange: 24,
    qtyBefore: 40,
    qtyAfter: 64,
    reason: "Weekly juice delivery from Fresh Juice Factory",
    referenceType: "purchase",
    createdBy: "user-manager-a",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    id: "move-02",
    shopId: "shop-b",
    productId: "prod-beer-07",
    type: "DAMAGE",
    qtyChange: -6,
    qtyBefore: 46,
    qtyAfter: 40,
    reason: "Damaged cartons - water leak",
    referenceType: "damage",
    createdBy: "user-manager-b",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(),
  },
  {
    id: "move-03",
    shopId: "shop-a",
    productId: "prod-beer-01",
    type: "ADJUSTMENT",
    qtyChange: -5,
    qtyBefore: 45,
    qtyAfter: 40,
    reason: "Inventory count correction",
    referenceType: "adjustment",
    createdBy: "user-manager-a",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
];

// ============================================
// SAMPLE STOCK TRANSFER (Pending)
// ============================================
export const seedStockTransfers: StockTransfer[] = [
  {
    id: "transfer-01",
    transferNo: "TRF-20260107-0001",
    fromShopId: "shop-a",
    toShopId: "shop-b",
    status: "PENDING",
    notes: "Urgent restock for weekend sale",
    createdBy: "user-manager-b",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];

export const seedStockTransferItems: StockTransferItem[] = [
  { id: "titem-01", transferId: "transfer-01", productId: "prod-beer-01", requestedQty: 12 },
  { id: "titem-02", transferId: "transfer-01", productId: "prod-juice-02", requestedQty: 24 },
];

// ============================================
// SAMPLE PURCHASE ORDERS
// ============================================
export const seedPurchaseOrders: PurchaseOrder[] = [
  {
    id: "po-01",
    orderNo: "PO-20260106-0001",
    shopId: "shop-a",
    supplierId: "supplier-01",
    status: "RECEIVED",
    subtotalMmk: 192000,
    totalMmk: 192000,
    paidMmk: 100000,
    paymentStatus: "PARTIAL",
    supplierInvoiceNo: "INV-MBC-20260106",
    deliveryNoteNo: "DN-MBC-0001",
    notes: "Weekly beer restock",
    createdBy: "user-manager-a",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    approvedBy: "user-admin",
    approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 46).toISOString(),
    receivedBy: "user-manager-a",
    receivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];

export const seedPurchaseOrderItems: PurchaseOrderItem[] = [
  { id: "poitem-01", purchaseOrderId: "po-01", productId: "prod-beer-01", orderedQty: 48, receivedQty: 48, unitCostMmk: 1600, lineTotalMmk: 76800 },
  { id: "poitem-02", purchaseOrderId: "po-01", productId: "prod-beer-02", orderedQty: 36, receivedQty: 36, unitCostMmk: 1500, lineTotalMmk: 54000 },
  { id: "poitem-03", purchaseOrderId: "po-01", productId: "prod-beer-03", orderedQty: 36, receivedQty: 36, unitCostMmk: 1700, lineTotalMmk: 61200 },
];

export const seedSupplierPayments: SupplierPayment[] = [
  {
    id: "suppay-01",
    supplierId: "supplier-01",
    purchaseOrderId: "po-01",
    shopId: "shop-a",
    amountMmk: 100000,
    paymentMethod: "CASH",
    referenceNo: "VOUCHER-001",
    notes: "Initial partial payment",
    paidAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
    createdBy: "user-manager-a",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
  },
];

export const seedShifts: Shift[] = [
  {
    id: "shift-open-a",
    shopId: "shop-a",
    cashierId: "user-cashier-a",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    openingCashMmk: 50000,
  },
  {
    id: "shift-closed-b",
    shopId: "shop-b",
    cashierId: "user-cashier-b",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 9).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    openingCashMmk: 40000,
    closingCashMmk: 68000,
    expectedCashMmk: 67000,
    varianceMmk: 1000,
  },
];

// Helper to create dates for the past week
const daysAgo = (days: number, hours = 12) => new Date(Date.now() - 1000 * 60 * 60 * 24 * days - 1000 * 60 * 60 * hours).toISOString();

export const seedSales: Sale[] = [
  // 6 days ago - Low sales day
  { id: "sale-d6-01", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D6-0001", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 8500, discountMmk: 0, cartDiscountPct: 0, totalMmk: 8500, paymentMethod: "CASH", paidMmk: 9000, changeMmk: 500, createdAt: daysAgo(6, 10) },
  { id: "sale-d6-02", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D6-0001", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 12000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 12000, paymentMethod: "CASH", paidMmk: 12000, changeMmk: 0, createdAt: daysAgo(6, 14) },

  // 5 days ago - Growing
  { id: "sale-d5-01", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D5-0001", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 15000, discountMmk: 500, cartDiscountPct: 0, totalMmk: 14500, paymentMethod: "CASH", paidMmk: 15000, changeMmk: 500, createdAt: daysAgo(5, 9) },
  { id: "sale-d5-02", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D5-0002", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 9800, discountMmk: 0, cartDiscountPct: 0, totalMmk: 9800, paymentMethod: "OTHER", paidMmk: 9800, changeMmk: 0, createdAt: daysAgo(5, 15) },
  { id: "sale-d5-03", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D5-0001", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 18000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 18000, paymentMethod: "CASH", paidMmk: 20000, changeMmk: 2000, createdAt: daysAgo(5, 16) },

  // 4 days ago - Peak day
  { id: "sale-d4-01", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D4-0001", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 24000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 24000, paymentMethod: "CASH", paidMmk: 25000, changeMmk: 1000, createdAt: daysAgo(4, 10) },
  { id: "sale-d4-02", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D4-0002", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 36000, discountMmk: 1000, cartDiscountPct: 0, totalMmk: 35000, paymentMethod: "OTHER", paidMmk: 35000, changeMmk: 0, createdAt: daysAgo(4, 13) },
  { id: "sale-d4-03", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D4-0001", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 28000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 28000, paymentMethod: "CASH", paidMmk: 30000, changeMmk: 2000, createdAt: daysAgo(4, 11) },
  { id: "sale-d4-04", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D4-0002", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 15500, discountMmk: 0, cartDiscountPct: 0, totalMmk: 15500, paymentMethod: "CASH", paidMmk: 16000, changeMmk: 500, createdAt: daysAgo(4, 17) },

  // 3 days ago - Moderate
  { id: "sale-d3-01", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D3-0001", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 22000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 22000, paymentMethod: "CASH", paidMmk: 22000, changeMmk: 0, createdAt: daysAgo(3, 11) },
  { id: "sale-d3-02", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D3-0001", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 19000, discountMmk: 500, cartDiscountPct: 0, totalMmk: 18500, paymentMethod: "CASH", paidMmk: 20000, changeMmk: 1500, createdAt: daysAgo(3, 14) },
  { id: "sale-d3-03", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D3-0002", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 8500, discountMmk: 0, cartDiscountPct: 0, totalMmk: 8500, paymentMethod: "CASH", paidMmk: 10000, changeMmk: 1500, createdAt: daysAgo(3, 18) },

  // 2 days ago - Dip
  { id: "sale-d2-01", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D2-0001", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 16000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 16000, paymentMethod: "CASH", paidMmk: 16000, changeMmk: 0, createdAt: daysAgo(2, 12) },
  { id: "sale-d2-02", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D2-0001", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 13500, discountMmk: 0, cartDiscountPct: 0, totalMmk: 13500, paymentMethod: "OTHER", paidMmk: 13500, changeMmk: 0, createdAt: daysAgo(2, 15) },

  // 1 day ago - Recovery
  { id: "sale-d1-01", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D1-0001", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 28000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 28000, paymentMethod: "CASH", paidMmk: 30000, changeMmk: 2000, createdAt: daysAgo(1, 10) },
  { id: "sale-d1-02", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D1-0002", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 12500, discountMmk: 0, cartDiscountPct: 0, totalMmk: 12500, paymentMethod: "CASH", paidMmk: 13000, changeMmk: 500, createdAt: daysAgo(1, 14) },
  { id: "sale-d1-03", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D1-0001", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 21000, discountMmk: 500, cartDiscountPct: 0, totalMmk: 20500, paymentMethod: "CASH", paidMmk: 21000, changeMmk: 500, createdAt: daysAgo(1, 16) },

  // Today - Strong day
  { id: "sale-d0-01", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D0-0001", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 32000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 32000, paymentMethod: "CASH", paidMmk: 35000, changeMmk: 3000, createdAt: daysAgo(0, 9) },
  { id: "sale-d0-02", shopId: "shop-a", shiftId: "shift-open-a", receiptNo: "A-D0-0002", cashierId: "user-cashier-a", status: "NORMAL", subtotalMmk: 18000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 18000, paymentMethod: "OTHER", paidMmk: 18000, changeMmk: 0, createdAt: daysAgo(0, 11) },
  { id: "sale-d0-03", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D0-0001", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 25000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 25000, paymentMethod: "CASH", paidMmk: 25000, changeMmk: 0, createdAt: daysAgo(0, 10) },
  { id: "sale-d0-04", shopId: "shop-b", shiftId: "shift-closed-b", receiptNo: "B-D0-0002", cashierId: "user-cashier-b", status: "NORMAL", subtotalMmk: 14000, discountMmk: 0, cartDiscountPct: 0, totalMmk: 14000, paymentMethod: "CASH", paidMmk: 15000, changeMmk: 1000, createdAt: daysAgo(0, 13) },
];

export const seedSaleItems: SaleItem[] = [
  // 6 days ago - Low sales day
  // sale-d6-01: totalMmk: 8500 (beer + juice)
  { saleId: "sale-d6-01", productId: "prod-beer-01", qtyUnits: 2, unitPriceMmk: 2200, lineTotalMmk: 4400, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d6-01", productId: "prod-juice-01", qtyUnits: 2, unitPriceMmk: 1800, lineTotalMmk: 3600, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d6-01", productId: "prod-juice-07", qtyUnits: 1, unitPriceMmk: 500, lineTotalMmk: 500, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d6-02: totalMmk: 12000 (alcohol)
  { saleId: "sale-d6-02", productId: "prod-alc-01", qtyUnits: 1, unitPriceMmk: 12000, lineTotalMmk: 12000, unitLabel: "bottle", unitsPerItem: 1 },

  // 5 days ago - Growing
  // sale-d5-01: totalMmk: 14500 (beer + juice)
  { saleId: "sale-d5-01", productId: "prod-beer-03", qtyUnits: 4, unitPriceMmk: 2400, lineTotalMmk: 9600, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d5-01", productId: "prod-juice-03", qtyUnits: 3, unitPriceMmk: 1900, lineTotalMmk: 5700, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d5-02: totalMmk: 9800 (beer)
  { saleId: "sale-d5-02", productId: "prod-beer-04", qtyUnits: 4, unitPriceMmk: 2500, lineTotalMmk: 10000, unitLabel: "can", unitsPerItem: 1 },
  // sale-d5-03: totalMmk: 18000 (alcohol)
  { saleId: "sale-d5-03", productId: "prod-alc-04", qtyUnits: 1, unitPriceMmk: 18000, lineTotalMmk: 18000, unitLabel: "bottle", unitsPerItem: 1 },

  // 4 days ago - Peak day
  // sale-d4-01: totalMmk: 24000 (alcohol)
  { saleId: "sale-d4-01", productId: "prod-alc-02", qtyUnits: 1, unitPriceMmk: 24000, lineTotalMmk: 24000, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d4-02: totalMmk: 35000 (beer + alcohol)
  { saleId: "sale-d4-02", productId: "prod-alc-03", qtyUnits: 1, unitPriceMmk: 21000, lineTotalMmk: 21000, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d4-02", productId: "prod-beer-07", qtyUnits: 5, unitPriceMmk: 2800, lineTotalMmk: 14000, unitLabel: "can", unitsPerItem: 1 },
  // sale-d4-03: totalMmk: 28000 (alcohol + beer)
  { saleId: "sale-d4-03", productId: "prod-alc-05", qtyUnits: 1, unitPriceMmk: 15000, lineTotalMmk: 15000, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d4-03", productId: "prod-beer-06", qtyUnits: 5, unitPriceMmk: 2600, lineTotalMmk: 13000, unitLabel: "can", unitsPerItem: 1 },
  // sale-d4-04: totalMmk: 15500 (beer + juice)
  { saleId: "sale-d4-04", productId: "prod-beer-02", qtyUnits: 5, unitPriceMmk: 2100, lineTotalMmk: 10500, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d4-04", productId: "prod-juice-05", qtyUnits: 4, unitPriceMmk: 1300, lineTotalMmk: 5200, unitLabel: "bottle", unitsPerItem: 1 },

  // 3 days ago - Moderate
  // sale-d3-01: totalMmk: 22000 (alcohol + juice)
  { saleId: "sale-d3-01", productId: "prod-alc-06", qtyUnits: 1, unitPriceMmk: 17000, lineTotalMmk: 17000, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d3-01", productId: "prod-juice-06", qtyUnits: 3, unitPriceMmk: 1850, lineTotalMmk: 5550, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d3-02: totalMmk: 18500 (beer + juice)
  { saleId: "sale-d3-02", productId: "prod-beer-08", qtyUnits: 5, unitPriceMmk: 2700, lineTotalMmk: 13500, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d3-02", productId: "prod-juice-04", qtyUnits: 3, unitPriceMmk: 1700, lineTotalMmk: 5100, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d3-03: totalMmk: 8500 (beer)
  { saleId: "sale-d3-03", productId: "prod-beer-05", qtyUnits: 3, unitPriceMmk: 2300, lineTotalMmk: 6900, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d3-03", productId: "prod-juice-02", qtyUnits: 2, unitPriceMmk: 900, lineTotalMmk: 1800, unitLabel: "bottle", unitsPerItem: 1 },

  // 2 days ago - Dip
  // sale-d2-01: totalMmk: 16000 (beer + juice)
  { saleId: "sale-d2-01", productId: "prod-beer-10", qtyUnits: 6, unitPriceMmk: 2000, lineTotalMmk: 12000, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d2-01", productId: "prod-juice-08", qtyUnits: 3, unitPriceMmk: 1400, lineTotalMmk: 4200, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d2-02: totalMmk: 13500 (alcohol)
  { saleId: "sale-d2-02", productId: "prod-alc-04", qtyUnits: 1, unitPriceMmk: 13500, lineTotalMmk: 13500, unitLabel: "bottle", unitsPerItem: 1 },

  // 1 day ago - Recovery
  // sale-d1-01: totalMmk: 28000 (alcohol + beer)
  { saleId: "sale-d1-01", productId: "prod-alc-07", qtyUnits: 1, unitPriceMmk: 26000, lineTotalMmk: 26000, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d1-01", productId: "prod-beer-01", qtyUnits: 1, unitPriceMmk: 2200, lineTotalMmk: 2200, unitLabel: "can", unitsPerItem: 1 },
  // sale-d1-02: totalMmk: 12500 (beer + juice)
  { saleId: "sale-d1-02", productId: "prod-beer-11", qtyUnits: 3, unitPriceMmk: 2600, lineTotalMmk: 7800, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d1-02", productId: "prod-juice-09", qtyUnits: 3, unitPriceMmk: 1500, lineTotalMmk: 4500, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d1-03: totalMmk: 20500 (alcohol)
  { saleId: "sale-d1-03", productId: "prod-alc-10", qtyUnits: 1, unitPriceMmk: 20000, lineTotalMmk: 20000, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d1-03", productId: "prod-juice-02", qtyUnits: 1, unitPriceMmk: 900, lineTotalMmk: 900, unitLabel: "bottle", unitsPerItem: 1 },

  // Today - Strong day
  // sale-d0-01: totalMmk: 32000 (alcohol + beer)
  { saleId: "sale-d0-01", productId: "prod-alc-08", qtyUnits: 1, unitPriceMmk: 22000, lineTotalMmk: 22000, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d0-01", productId: "prod-beer-12", qtyUnits: 3, unitPriceMmk: 3100, lineTotalMmk: 9300, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d0-01", productId: "prod-juice-02", qtyUnits: 1, unitPriceMmk: 900, lineTotalMmk: 900, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d0-02: totalMmk: 18000 (beer)
  { saleId: "sale-d0-02", productId: "prod-beer-09", qtyUnits: 4, unitPriceMmk: 2900, lineTotalMmk: 11600, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d0-02", productId: "prod-beer-03", qtyUnits: 3, unitPriceMmk: 2400, lineTotalMmk: 7200, unitLabel: "can", unitsPerItem: 1 },
  // sale-d0-03: totalMmk: 25000 (alcohol + juice)
  { saleId: "sale-d0-03", productId: "prod-alc-09", qtyUnits: 1, unitPriceMmk: 19000, lineTotalMmk: 19000, unitLabel: "bottle", unitsPerItem: 1 },
  { saleId: "sale-d0-03", productId: "prod-juice-03", qtyUnits: 3, unitPriceMmk: 1900, lineTotalMmk: 5700, unitLabel: "bottle", unitsPerItem: 1 },
  // sale-d0-04: totalMmk: 14000 (beer + juice)
  { saleId: "sale-d0-04", productId: "prod-beer-04", qtyUnits: 4, unitPriceMmk: 2500, lineTotalMmk: 10000, unitLabel: "can", unitsPerItem: 1 },
  { saleId: "sale-d0-04", productId: "prod-juice-10", qtyUnits: 3, unitPriceMmk: 1200, lineTotalMmk: 3600, unitLabel: "bottle", unitsPerItem: 1 },
];

export const seedAuditLogs: AuditLog[] = [
  {
    id: "audit-01",
    shopId: "shop-a",
    actorId: "user-manager-a",
    actionType: "INVENTORY_ADJUST",
    message: "Adjusted Orange Burst 1L stock +24 (received delivery)",
    entityType: "Inventory",
    entityId: "prod-juice-01",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
];

export const seedRefundVoidRequests: RefundVoidRequest[] = [];

export const seedCategories: Category[] = [
  { id: "cat-beer", name: "beer", color: "amber", isActive: true, createdAt: dayAgo },
  { id: "cat-alcohol", name: "alcohol", color: "red", isActive: true, createdAt: dayAgo },
  { id: "cat-juice", name: "juice", color: "green", isActive: true, createdAt: dayAgo },
];

export const seedData = {
  // Core entities
  shops: seedShops,
  users: seedUsers,
  categories: seedCategories,
  products: seedProducts,
  productUnits: seedProductUnits,
  barcodes: seedBarcodes,
  inventory: seedInventory,
  movements: seedMovements,
  shifts: seedShifts,
  sales: seedSales,
  saleItems: seedSaleItems,
  refunds: seedRefundVoidRequests,
  refundVoidRequests: seedRefundVoidRequests,
  reprintLogs: [] as { id: string; saleId: string; printedBy: string; printedAt: string }[],
  auditLogs: seedAuditLogs,

  // New entities
  suppliers: seedSuppliers,
  purchaseOrders: seedPurchaseOrders,
  purchaseOrderItems: seedPurchaseOrderItems,
  supplierPayments: seedSupplierPayments,
  stockTransfers: seedStockTransfers,
  stockTransferItems: seedStockTransferItems,
  priceTiers: seedPriceTiers,
};
