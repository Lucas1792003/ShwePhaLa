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
  paidMmk?: number;
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
  supplierInvoiceNo?: string;
  deliveryNoteNo?: string;
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

## Supplier Debt / Payables

Supplier debt starts only when goods are received.

- Creating, submitting, or approving a PO does **not** create debt.
- `RECEIVED` POs create supplier payable balance.
- Canceled POs never count as debt.
- Outstanding balance = `purchase_orders.total_mmk - purchase_orders.paid_mmk`.
- Supplier debt = sum of outstanding balances for received POs for that
  supplier and shop.
- Receiving goods and paying the supplier are separate actions.
- Supplier payments do not affect cashier shifts yet.

PO payment status:

| Status | Rule |
| --- | --- |
| `UNPAID` | Received PO has no payments |
| `PARTIAL` | Received PO has some payment but still has balance |
| `PAID` | Received PO is fully paid |

Supplier payments are stored in `supplier_payments` and written only through
the `record_supplier_payment(...)` SECURITY DEFINER RPC:

```sql
record_supplier_payment(
  p_purchase_order_id text,
  p_amount_mmk integer,
  p_payment_method text,
  p_reference_no text default null,
  p_notes text default null
) returns jsonb
```

The RPC validates authentication, `supplier:payment_create`, shop scope, PO
status `RECEIVED`, positive amount, and no overpayment. It inserts the payment,
updates `purchase_orders.paid_mmk` / `payment_status`, and writes an audit row.

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
| View supplier debt/payment records | `supplier:debt_view` |
| Record supplier payment | `supplier:payment_create` |
| View purchase orders | `purchase:create` (implied) |
| Create/Edit POs | `purchase:create` |
| Approve POs | `purchase:approve` |
| Receive stock | `purchase:receive` |

## UI Pages

### Suppliers Page (`/app/suppliers`)

- List all suppliers with search.
- Per row: order count, received purchase total, paid amount, outstanding debt,
  debt status, active status.
- Row click or **View details** navigates to the supplier detail page; row
  Action buttons (Edit, Activate / Deactivate) do not navigate.
- Add Supplier modal (gated by `supplier:create`).

### Supplier Detail Page (`/app/suppliers/:supplierId`)

The supplier detail workspace. Replaces the old side drawer because the
account view now covers profile, summary, PO actions, receiving
confirmation, and payment history — all of which used to compete for one
narrow drawer panel.

Layout:

- **Header.** Back link, breadcrumb (`Suppliers / <name>`), supplier name,
  status / code / contact badges, and the action cluster: **Back**, **Edit
  supplier** (gated by `supplier:update`), and **Create purchase order**
  (gated by `purchase:create` for the current shop, hidden for inactive
  suppliers).
- **Summary cards (5).** Outstanding debt, Received purchases, Paid,
  Unpaid / partial PO count, Last purchase. Money cards hide their value
  ("—") when the caller lacks `supplier:debt_view` / `purchase:view`.
- **Tabs.**
  1. **Overview** — profile card (contact, phone, email, address, code,
     added date) plus notes block.
  2. **Purchase Orders** — one card per PO with PO number, shop, created
     date, status / received / payment badges, the next-step hint badge
     ("Needs approval / receiving / payment") when the user lacks the
     relevant permission, Total / Paid / Balance money grid, received-by/at,
     and an Action row. **View details** toggles an inline expanded panel
     with supplier invoice no, delivery note no, approved at/by, the
     receiving-confirmation banner for RECEIVED POs, and the line-items
     table (ordered / received / unit cost / line total).
  3. **Payments** — a full-width table of date, PO no, amount, method,
     reference, notes, and recorded by. Empty state reads "No supplier
     payments recorded yet."

Per-PO action buttons follow `getPurchaseOrderActionState(po, user)` in
`src/features/suppliers/actions.ts`:

| PO state | Next action | When user lacks permission |
| --- | --- | --- |
| DRAFT / SUBMITTED | **Approve** | "Needs approval" badge |
| APPROVED | **Receive** | "Needs receiving" badge |
| RECEIVED + balance > 0 | **Record payment** | "Needs payment" badge |
| RECEIVED + paid | — terminal | — |
| CANCELED | — terminal | — |
| Non-terminal + has `purchase:create` | **Cancel PO** | hidden |

Buttons disable while their request is in flight (`busyPoId`) so a
double-click can't double-submit. Modals (`SupplierFormModal`,
`SupplierPaymentModal`, `PurchaseOrderCreateModal`,
`PurchaseOrderReceiveModal`) keep open on failure with form values
preserved, show an inline rose-tinted error banner, and refuse to close
mid-submit.

If the supplier id is unknown or hidden by RLS, the page renders a friendly
"Supplier not found or you do not have access." card with a Back to
Suppliers button — no crash.

### Purchases Page (`/app/purchases`)

- List all purchase orders with status filters and search.
- Create new PO flow uses the shared `PurchaseOrderCreateModal`.
- **Approve** gated by `canApprovePurchaseOrder(user, po)`, **Receive** by
  `canReceivePurchaseOrder(user, po)`, **Cancel** by `hasShopPermission(user,
  "purchase:create", po.shopId)` (was role-only — drifted from the
  permission model; now consistent with the Supplier detail page).
- Errors route through `getErrorMessage` from `src/lib/errors.ts` — no more
  raw Postgres messages in toasts.

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
6. **Payment Discipline**: Record supplier payments against the received PO so
   outstanding debt remains traceable.

