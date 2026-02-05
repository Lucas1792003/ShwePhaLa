# Stock Transfers

## Overview

Stock Transfers enable moving inventory between shops with a formal approval workflow. This ensures accountability and prevents unauthorized stock movements.

## Transfer Workflow

```
PENDING → APPROVED → COMPLETED
    ↓         ↓
CANCELED  REJECTED
```

### Status Definitions

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| `PENDING` | Transfer created, awaiting approval | Approve, Reject, Cancel |
| `APPROVED` | Approved by destination shop | Complete, Cancel |
| `COMPLETED` | Stock has been moved | None (final) |
| `CANCELED` | Canceled by source shop | None (final) |
| `REJECTED` | Rejected by destination shop | None (final) |

## Transfer Process

### 1. Create Transfer (Source Shop)

- User with `transfer:create` permission initiates transfer
- Selects products and quantities to transfer
- Selects destination shop
- Provides transfer notes (optional)
- Status: `PENDING`

```typescript
interface StockTransfer {
  id: string;
  transferNo: string;        // Auto-generated: TRF-YYYYMMDD-XXX
  fromShopId: string;        // Source shop
  toShopId: string;          // Destination shop
  status: TransferStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
  completedBy?: string;
  completedAt?: string;
}

interface StockTransferItem {
  id: string;
  transferId: string;
  productId: string;
  qtyRequested: number;      // Original request
  qtyApproved?: number;      // May differ from requested
  qtyReceived?: number;      // Actual received (for discrepancies)
}
```

### 2. Approve/Reject Transfer (Destination Shop)

- User with `transfer:approve` permission reviews the request
- Can adjust quantities (partial approval)
- Approves or rejects with reason
- Status: `APPROVED` or `REJECTED`

### 3. Complete Transfer (Either Shop)

- User with `transfer:approve` permission marks transfer complete
- System creates inventory movements:
  - `TRANSFER_OUT` at source shop (negative)
  - `TRANSFER_IN` at destination shop (positive)
- Stock levels updated atomically
- Status: `COMPLETED`

### 4. Cancel Transfer (Source Shop)

- User with `transfer:cancel` permission can cancel pending transfers
- No stock movements created
- Status: `CANCELED`

## Inventory Movements

When a transfer is completed, the system creates two movement records:

**Source Shop (TRANSFER_OUT):**
```typescript
{
  shopId: fromShopId,
  productId: item.productId,
  type: "TRANSFER_OUT",
  qtyChange: -qtyApproved,  // Negative
  reason: `Transfer to ${toShopName}`,
  referenceType: "transfer",
  referenceId: transfer.id,
}
```

**Destination Shop (TRANSFER_IN):**
```typescript
{
  shopId: toShopId,
  productId: item.productId,
  type: "TRANSFER_IN",
  qtyChange: +qtyApproved,  // Positive
  reason: `Transfer from ${fromShopName}`,
  referenceType: "transfer",
  referenceId: transfer.id,
}
```

## Validation Rules

1. **Stock Availability**: Source shop must have sufficient stock at completion time
2. **Different Shops**: Cannot transfer to the same shop
3. **Active Products**: All products must be active
4. **Quantity Limits**: Approved quantity cannot exceed requested quantity

## Permissions

| Action | Required Permission |
|--------|---------------------|
| View transfers | `transfer:view` |
| Create transfer | `transfer:create` |
| Approve/Reject transfer | `transfer:approve` |
| Cancel transfer | `transfer:cancel` |

## UI Pages

### Transfers Page (`/transfers`)

- **Outgoing Tab**: Transfers initiated by current shop
- **Incoming Tab**: Transfers requested from other shops
- **Filters**: Status, date range, shop
- **Actions**: Create, Approve, Reject, Complete, Cancel (based on permissions)

## Reports

Transfer data is available in:
- **Transfer History Report**: All transfers with filters
- **Borrowed/Lent Summary**: Net stock movement between shops
- **Audit Log**: All transfer actions logged

## Best Practices

1. **Regular Reconciliation**: Verify physical stock matches system after transfers
2. **Prompt Completion**: Complete approved transfers promptly to maintain accuracy
3. **Quantity Verification**: Receiving shop should verify quantities match
4. **Documentation**: Use notes field for special instructions or discrepancies
