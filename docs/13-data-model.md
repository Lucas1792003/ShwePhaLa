# Data Model

## Core Entities

### Shop
```typescript
Shop {
  id: string;
  code: string;
  name: string;
  address: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}
```

### User
```typescript
User {
  id: string;
  name: string;
  email?: string;
  role: "ADMIN" | "MANAGER" | "CASHIER" | "BUYER";
  shopId?: string;
  permissions?: Permission[];  // Custom permissions override
  isActive: boolean;
  createdAt: string;
}
```

### Category
```typescript
Category {
  id: string;
  name: string;
  color: "amber" | "red" | "green" | "blue" | "purple" | "slate";
  isActive: boolean;
  createdAt: string;
}
```

### Product
```typescript
Product {
  id: string;
  sku?: string;
  name: string;
  category: string;           // Dynamic category (references Category.name)
  unitType: "piece" | "box" | "kg" | "liter" | "pack";
  priceMmk: number;
  costMmk?: number;
  packSize?: number;
  lowStockThreshold: number;
  expiryDate?: string;
  isActive: boolean;
  createdAt: string;
}
```

### ProductBarcode
```typescript
ProductBarcode {
  id: string;
  productId: string;
  value: string;
  type: "EAN13" | "CODE128" | "QR";
}
```

## Inventory & Stock Movement

### Inventory
```typescript
Inventory {
  shopId: string;
  productId: string;
  qtyBaseUnits: number;
  storageLocation?: string;
  lastCountedAt?: string;
}
```

### InventoryMovement (Ledger-Based)
Every stock change MUST create a movement record for full traceability.

```typescript
InventoryMovement {
  id: string;
  shopId: string;
  productId: string;
  type: StockMovementType;
  qtyChange: number;      // Positive = IN, Negative = OUT
  qtyBefore: number;      // Stock level before movement
  qtyAfter: number;       // Stock level after movement
  reason: string;
  referenceType?: "sale" | "transfer" | "purchase" | "adjustment" | "damage";
  referenceId?: string;   // ID of related document
  createdBy: string;
  createdAt: string;
}
```

### StockMovementType
```typescript
type StockMovementType =
  | "PURCHASE_IN"    // Stock received from supplier
  | "SALE_OUT"       // Stock sold to customer
  | "TRANSFER_OUT"   // Stock sent to another shop
  | "TRANSFER_IN"    // Stock received from another shop
  | "ADJUSTMENT"     // Manual stock correction
  | "DAMAGE"         // Damaged/expired stock write-off
  | "RETURN_IN"      // Customer return
  | "RETURN_OUT";    // Return to supplier
```

## Stock Transfers (Inter-Shop)

### StockTransfer
```typescript
StockTransfer {
  id: string;
  transferNo: string;           // Format: TRF-YYYYMMDD-NNNN
  fromShopId: string;
  toShopId: string;
  status: "PENDING" | "APPROVED" | "COMPLETED" | "CANCELED" | "REJECTED";
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
```

### StockTransferItem
```typescript
StockTransferItem {
  id: string;
  transferId: string;
  productId: string;
  requestedQty: number;
  approvedQty?: number;
  transferredQty?: number;
}
```

## Suppliers & Purchasing

### Supplier
```typescript
Supplier {
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
```

### PurchaseOrder
```typescript
PurchaseOrder {
  id: string;
  orderNo: string;              // Format: PO-YYYYMMDD-NNNN
  shopId: string;
  supplierId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RECEIVED" | "CANCELED";
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
```

### PurchaseOrderItem
```typescript
PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  orderedQty: number;
  receivedQty?: number;
  unitCostMmk: number;
  lineTotalMmk: number;
}
```

## Tier-Based Pricing

### PriceTier
```typescript
PriceTier {
  id: string;
  productId: string;
  shopId?: string;       // null = applies to all shops
  minQty: number;        // Minimum quantity for this tier
  maxQty?: number;       // Maximum quantity (null = unlimited)
  priceMmk: number;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}
```

**Example pricing tiers:**
| Qty Range | Price/Unit |
|-----------|------------|
| 1-9       | MMK 2,200  |
| 10-23     | MMK 2,100  |
| 24+       | MMK 1,900  |

## POS & Sales

### Shift
```typescript
Shift {
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
```

### Sale
```typescript
Sale {
  id: string;
  shopId: string;
  shiftId: string;
  receiptNo: string;
  cashierId: string;
  status: "NORMAL" | "VOID" | "REFUNDED";
  subtotalMmk: number;
  discountMmk: number;
  cartDiscountPct?: number;
  totalMmk: number;
  paymentMethod: "CASH" | "OTHER";
  paidMmk: number;
  changeMmk: number;
  createdAt: string;
}
```

### SaleItem
```typescript
SaleItem {
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
```

## Refunds & Voids

### RefundVoidRequest
```typescript
RefundVoidRequest {
  id: string;
  saleId: string;
  shopId: string;
  type: "VOID" | "PARTIAL";
  reason: string;
  createdBy: string;
  createdAt: string;
  items?: { productId: string; qtyUnits: number; amountMmk: number }[];
  status?: "REQUESTED" | "APPROVED";
}
```

## Audit & Logging

### AuditLog
```typescript
AuditLog {
  id: string;
  shopId?: string;
  actorId: string;
  actionType: string;
  message: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}
```

### ReprintLog
```typescript
ReprintLog {
  id: string;
  saleId: string;
  printedBy: string;
  printedAt: string;
}
```

## Numbering Formats

| Document | Format | Example |
|----------|--------|---------|
| Receipt | `{SHOP_CODE}-{YYYYMMDD}-{SEQ}` | `A-20260107-0002` |
| Transfer | `TRF-{YYYYMMDD}-{SEQ}` | `TRF-20260107-0001` |
| Purchase Order | `PO-{YYYYMMDD}-{SEQ}` | `PO-20260107-0001` |

## Entity Relationships

```
Shop 1──N User
Shop 1──N Inventory
Shop 1──N Shift
Shop 1──N Sale
Shop 1──N StockTransfer (from/to)
Shop 1──N PurchaseOrder

Category 1──N Product (via category name)

Product 1──N ProductBarcode
Product 1──N Inventory
Product 1──N PriceTier
Product 1──N SaleItem
Product 1──N StockTransferItem
Product 1──N PurchaseOrderItem

Supplier 1──N PurchaseOrder

Sale 1──N SaleItem
Sale 1──N RefundVoidRequest

Shift 1──N Sale

StockTransfer 1──N StockTransferItem
PurchaseOrder 1──N PurchaseOrderItem
```
