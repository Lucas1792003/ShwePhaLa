# Inventory Flow

## Overview

The system uses **ledger-based inventory tracking** where every stock change creates an `InventoryMovement` record with before/after quantities. This provides a complete audit trail and enables accurate stock valuation and reporting.

## Multi-Shop Isolation

**CRITICAL**: Inventory is **NOT shared** between shops. Each shop maintains its own isolated stock levels:

- `InventoryLevel` records are unique per `(shopId, productId)` combination
- Moving stock between shops requires a formal **Stock Transfer**
- Each shop tracks its own stock valuations and movement history

## Movement Types

| Type | Direction | Description | Auto-Created |
|------|-----------|-------------|--------------|
| `PURCHASE_IN` | + | Stock received from supplier | On PO receive |
| `SALE_OUT` | - | Stock sold to customer | On sale complete |
| `TRANSFER_OUT` | - | Stock sent to another shop | On transfer complete |
| `TRANSFER_IN` | + | Stock received from transfer | On transfer complete |
| `ADJUSTMENT` | +/- | Manual stock correction | Manual |
| `DAMAGE` | - | Damaged/expired write-off | Manual |
| `RETURN_IN` | + | Customer return received | On refund |
| `RETURN_OUT` | - | Return to supplier | Manual |

## Movement Record Structure

```typescript
interface InventoryMovement {
  id: string;
  shopId: string;
  productId: string;
  type: StockMovementType;
  qtyChange: number;    // Positive for IN, negative for OUT
  qtyBefore: number;    // Stock level before movement
  qtyAfter: number;     // Stock level after movement
  reason: string;       // User-provided reason or auto-description
  referenceType?: "sale" | "transfer" | "purchase" | "adjustment" | "damage";
  referenceId?: string; // Link to source record
  createdBy: string;
  createdAt: string;
}
```

## Movement Creation

### Automatic Movements

1. **Sales** (`SALE_OUT`)
   - Created when a sale is completed
   - Links to Sale ID via `referenceId`
   - Quantity change is negative

2. **Purchase Orders** (`PURCHASE_IN`)
   - Created when a PO status changes to `RECEIVED`
   - Links to PurchaseOrder ID
   - Quantity change is positive

3. **Stock Transfers** (`TRANSFER_OUT` / `TRANSFER_IN`)
   - Created when a transfer status changes to `COMPLETED`
   - Creates `TRANSFER_OUT` at source shop (negative)
   - Creates `TRANSFER_IN` at destination shop (positive)
   - Both link to StockTransfer ID

4. **Refunds** (`RETURN_IN`)
   - Created when a sale is refunded
   - Quantity change is positive (stock returned)

### Manual Movements

1. **Adjustments** (`ADJUSTMENT`)
   - Created via Inventory page "Adjust Stock" action
   - Requires reason: "Count correction", "Initial stock", etc.
   - Can be positive or negative

2. **Damage Write-offs** (`DAMAGE`)
   - Created via Inventory page "Record Damage" action
   - Requires reason: "Expired", "Broken", "Water damage", etc.
   - Always negative

3. **Supplier Returns** (`RETURN_OUT`)
   - Created via Inventory page "Return to Supplier" action
   - Always negative

## Stock Level Updates

When a movement is recorded:

```typescript
// 1. Get current stock level
const currentQty = inventoryLevel.qtyBaseUnits;

// 2. Calculate new quantity
const newQty = currentQty + qtyChange;

// 3. Create movement record
const movement = {
  qtyBefore: currentQty,
  qtyAfter: newQty,
  qtyChange: qtyChange,
  // ...
};

// 4. Update inventory level
inventoryLevel.qtyBaseUnits = newQty;
inventoryLevel.lastUpdated = now;
```

## Low Stock Logic

- **Low Stock Badge**: Appears when `qtyBaseUnits <= lowStockThreshold`
- **Out of Stock**: When `qtyBaseUnits <= 0`
- **POS Behavior**: Out-of-stock blocks sale unless user has `pos:override_stock` permission

## Stock Valuation

Stock value is calculated using weighted average cost:

```typescript
// For stock-in movements (PURCHASE_IN, TRANSFER_IN, RETURN_IN):
const totalCost = (existingQty * existingAvgCost) + (newQty * newItemCost);
const newAvgCost = totalCost / (existingQty + newQty);
```

## Viewing Movements

- **Inventory Page**: Filter movements by product, date range, and movement type
- **Reports**: Aggregate movement data for profit analysis and stock reconciliation
- **Audit Trail**: All movements create corresponding `AuditLog` entries

## Permissions

| Action | Required Permission |
|--------|---------------------|
| View movements | `inventory:read` |
| Adjust stock | `inventory:adjust` |
| Record damage | `inventory:damage` |
| Override stock check | `pos:override_stock` |
