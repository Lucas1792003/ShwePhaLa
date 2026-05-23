# Data Model

This document describes the TypeScript domain model in `src/types/domain.ts`.
Database rows use `snake_case`; Zustand state uses these `camelCase` types.

## Core Entities

### Shop

```ts
interface Shop {
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

```ts
interface User {
  id: string;
  authId?: string;
  name: string;
  email?: string;
  role: "ADMIN" | "MANAGER" | "CASHIER" | "BUYER";
  shopId?: string;
  grantedPermissions?: Permission[];
  revokedPermissions?: Permission[];
  permissions?: Permission[]; // deprecated legacy field
  isActive: boolean;
  createdAt: string;
}
```

Effective permissions are role defaults plus grants minus revokes. See
[01-roles-permissions.md](./01-roles-permissions.md).

### Product

```ts
interface Product {
  id: string;
  sku?: string;
  name: string;
  category: string;
  unitType: "piece" | "box" | "kg" | "liter" | "pack";
  priceMmk: number;
  costMmk?: number;
  packSize?: number;
  lowStockThreshold: number;
  expiryDate?: string;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
}
```

### ProductBarcode

```ts
interface ProductBarcode {
  id: string;
  productId: string;
  value: string;
  type: "EAN13" | "CODE128" | "QR";
}
```

SKU is the primary catalog code. `ProductBarcode` still exists for optional
scan-code mappings, and POS barcode scan resolves through `product_barcodes`.

## Inventory

### Inventory

```ts
interface Inventory {
  shopId: string;
  productId: string;
  qtyBaseUnits: number;
}
```

The database table is `inventory`.

### InventoryMovement

```ts
interface InventoryMovement {
  id: string;
  shopId: string;
  productId: string;
  type: StockMovementType;
  qtyChange: number;
  qtyBefore: number;
  qtyAfter: number;
  reason: string;
  referenceType?: "sale" | "transfer" | "purchase" | "adjustment" | "damage";
  referenceId?: string;
  createdBy: string;
  createdAt: string;
}
```

All inventory-moving workflows write movement rows through RPCs.

## Sales

```ts
interface Shift {
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

interface Sale {
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

interface SaleItem {
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

## Refund / Void Requests

```ts
interface RefundVoidRequest {
  id: string;
  saleId: string;
  shopId: string;
  type: "VOID" | "PARTIAL";
  reason: string;
  createdBy: string;
  createdAt: string;
  items?: { productId: string; qtyUnits: number; amountMmk: number }[];
  status?: "REQUESTED" | "APPROVED" | "REJECTED";
}
```

The store aliases this type as `Refund` for UI compatibility, but the database
table is `refund_void_requests`.

## Purchasing And Transfers

```ts
interface PurchaseOrder {
  id: string;
  orderNo: string;
  shopId: string;
  supplierId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "RECEIVED" | "CANCELED";
  subtotalMmk: number;
  taxMmk?: number;
  totalMmk: number;
  paidMmk?: number;
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
  supplierInvoiceNo?: string;
  deliveryNoteNo?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
}

interface SupplierPayment {
  id: string;
  supplierId: string;
  purchaseOrderId: string;
  shopId: string;
  amountMmk: number;
  paymentMethod: "CASH" | "BANK" | "MOBILE" | "OTHER";
  referenceNo?: string;
  notes?: string;
  paidAt: string;
  createdBy: string;
  createdAt: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

interface StockTransfer {
  id: string;
  transferNo: string;
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

Item rows live in `purchase_order_items` and `stock_transfer_items`.

## Audit And Reprints

```ts
interface AuditLog {
  id: string;
  shopId?: string;
  actorId: string;
  actionType: string;
  message: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

interface ReprintLog {
  id: string;
  saleId: string;
  printedBy: string;
  printedAt: string;
}
```

Direct client writes to `audit_logs` are locked down; audit rows are written by
RPCs.

## Relationships

```text
Shop 1--N User
Shop 1--N Inventory
Shop 1--N Shift
Shop 1--N Sale
Shop 1--N PurchaseOrder
Shop 1--N StockTransfer (source or destination)

Product 1--N ProductBarcode
Product 1--N Inventory
Product 1--N SaleItem
Product 1--N PurchaseOrderItem
Product 1--N StockTransferItem
Product 1--N PriceTier

Sale 1--N SaleItem
Sale 1--N RefundVoidRequest
PurchaseOrder 1--N PurchaseOrderItem
StockTransfer 1--N StockTransferItem
```
