# Suppliers & Purchasing

## Overview

The Suppliers & Purchasing module manages vendor relationships and stock procurement through a formal purchase order workflow.

## Suppliers

### Supplier Entity

```typescript
interface Supplier {
  id: string;
  code: string;           // Unique supplier code (e.g., "SUP-001")
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

### Supplier Management

- **Create**: Add new suppliers with contact details
- **Edit**: Update supplier information
- **Deactivate**: Soft-delete (set `isActive: false`)
- **Delete**: Hard-delete (only if no associated POs)

## Purchase Orders

### PO Workflow

```
DRAFT → SUBMITTED → APPROVED → RECEIVED
  ↓         ↓          ↓
 (delete)  CANCELED  CANCELED
```

### Status Definitions

| Status | Description | Actions Available |
|--------|-------------|-------------------|
| `DRAFT` | Being prepared, not submitted | Edit, Submit, Delete |
| `SUBMITTED` | Awaiting approval | Approve, Cancel |
| `APPROVED` | Ready for receiving | Receive, Cancel |
| `RECEIVED` | Stock received and recorded | None (final) |
| `CANCELED` | Canceled at any stage | None (final) |

### PO Structure

```typescript
interface PurchaseOrder {
  id: string;
  orderNo: string;           // Auto-generated: PO-YYYYMMDD-XXX
  shopId: string;            // Receiving shop
  supplierId: string;
  status: PurchaseOrderStatus;
  subtotalMmk: number;
  taxMmk: number;
  totalMmk: number;
  notes?: string;
  expectedDate?: string;     // Expected delivery date
  createdBy: string;
  createdAt: string;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
}

interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived?: number;      // Actual received (may differ)
  unitCostMmk: number;
  totalCostMmk: number;
}
```

## Purchase Order Process

### 1. Create Draft PO

- User with `purchase:create` permission creates PO
- Select supplier and shop
- Add line items (products, quantities, costs)
- Save as draft for later editing
- Status: `DRAFT`

### 2. Submit for Approval

- Review items and totals
- Submit to approver
- Status: `SUBMITTED`

### 3. Approve PO

- User with `purchase:approve` permission reviews
- Verifies supplier, quantities, and costs
- Approves or cancels
- Status: `APPROVED`

### 4. Receive Stock

- User with `purchase:receive` permission records receipt
- Enter actual quantities received (may differ from ordered — partial receiving
  is supported)
- Receiving calls the **`receive_purchase_order` RPC** — one atomic,
  permission-checked transaction that records the received quantities, creates
  `PURCHASE_IN` inventory movements, updates (or creates) stock levels, writes
  the audit row, and marks the PO `RECEIVED` — all committed together.
- Status: `RECEIVED`

## Inventory Integration

When a PO is received, the system:

1. **Creates Movements**: For each line item:
   ```typescript
   {
     shopId: po.shopId,
     productId: item.productId,
     type: "PURCHASE_IN",
     qtyChange: +qtyReceived,
     reason: `PO ${po.orderNo} from ${supplier.name}`,
     referenceType: "purchase",
     referenceId: po.id,
   }
   ```

2. **Updates Stock**: Adds received quantities to inventory levels

3. **Updates Costs**: Can update product cost for valuation purposes

## Permissions

| Action | Required Permission |
|--------|---------------------|
| View suppliers | `supplier:read` |
| Create/Edit suppliers | `supplier:create`, `supplier:update` |
| Delete suppliers | `supplier:delete` |
| View purchase orders | `purchase:create` (implied) |
| Create/Edit POs | `purchase:create` |
| Approve POs | `purchase:approve` |
| Receive stock | `purchase:receive` |

## UI Pages

### Suppliers Page (`/suppliers`)

- List all suppliers with search/filter
- Add/Edit supplier modal
- View supplier's PO history

### Purchases Page (`/purchases`)

- List all purchase orders with status filters
- Create new PO flow
- Approve/Receive actions based on status and permissions

## Reports

Purchase data available in:
- **Purchase History**: All POs with filters
- **Supplier Summary**: Spending by supplier
- **Cost Analysis**: Track product cost changes over time
- **Inventory Valuation**: Uses purchase costs for COGS calculations

## Best Practices

1. **Accurate Costs**: Enter actual purchase costs for accurate profit reporting
2. **Verify Receipts**: Always count received items before marking as received
3. **Partial Receipts**: Record actual quantities even if less than ordered
4. **Supplier Tracking**: Use notes field for delivery issues or quality concerns
5. **Approval Controls**: Require approval for POs above certain amounts

