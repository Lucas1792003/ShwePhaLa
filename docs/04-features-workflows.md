# 04 · Features & Workflows

Every business workflow listed here is an atomic Supabase RPC unless
explicitly noted. See [03-database-security.md](./03-database-security.md)
for the full RPC list.

## POS Sale

### Barcode scan

- F3 toggles the barcode input; Escape hides it. The input autofocuses and
  is **refocused after every scan** so the next Enter-terminated burst
  always lands there.
- On Enter, POS calls `findProductForScan(value, products, barcodes)` in
  `src/features/pos/barcodeLookup.ts`:
  1. Exact (verbatim, case-sensitive) match against `product_barcodes.value`.
  2. Trimmed, case-insensitive match against `products.sku`.
  This mirrors the label printer's selection rule so a SKU-source label
  scans back correctly.
- On hit: cart adds 1 (respecting pack mode), success toast `Added <name>`.
- On miss: error toast `Barcode not found`.
- Stock guards apply: out of stock / at max cart units shows
  `Only X in stock for this shop.`

### Cart

- Quantity changes via scan, +/-, or direct edit.
- Per-line item discount %.
- Cart discount % applies after item discounts.
- Price override requires `pos:override_price`.
- Selling below stock requires `pos:override_stock`.
- Tier pricing recalculates the unit price as quantity crosses each tier
  threshold (see Pricing section below).

### Checkout

1. Cashier must have an open shift (`complete_sale` rejects otherwise).
2. Payment modal opens with `Amount received` defaulted to 0; Confirm is
   disabled until paid ≥ total.
3. Confirm calls `complete_sale(...)` — one atomic, permission-checked RPC.
   It validates auth, shop access, shift, products, inventory, stock, and
   override permissions; then inserts sale + sale items, decrements
   inventory, writes `SALE_OUT` movements, and writes the audit row.
4. The cart clears and the receipt page (`/app/sales/:saleId`) opens only
   after RPC success.

### Receipt + reprint

- The post-payment route `/app/sales/:saleId` and the Sales History drawer
  both render the shared `ReceiptDetail` component.
- **Print** calls `window.print()` directly; it does not log.
- **Reprint** is gated by `receipt:reprint`. It awaits `log_receipt_reprint`,
  then prints. The in-flight flag prevents duplicate log rows on rapid
  clicks. The button shows `Reprinting…` while pending; any RPC failure
  shows a toast and skips the print dialog.
- Printing isolates the 80 mm `.receipt` DOM via `src/print/receipt.css`
  (`@media print` hides everything else). See [06-ui-printing-hardware.md](./06-ui-printing-hardware.md).

### Cashier sales history

- `/app/sales` is gated by `sales:view_own_shift` (cashiers have this).
- RLS narrows rows: a caller without `sale:view` only sees sales they rang
  up or sales in shifts they own.
- The client mirrors RLS: cashier filter hidden, "Void sale" swapped for
  "Request void", approve buttons hidden unless the caller has the
  corresponding `pos:refund` / `pos:void_sale`.

## Shifts

### Open

- Cashier enters opening cash.
- `open_shift(p_shop_id, p_opening_cash_mmk)` writes `opening_cash_mmk` and
  `started_at`. `expected_cash_mmk`, `closing_cash_mmk`, and `variance_mmk`
  remain `NULL` until close.
- A shift is required for POS checkout.

### Close

- Cashier enters closing cash.
- `close_shift(p_shift_id, p_closing_cash_mmk, p_variance_reason)`
  recomputes server-side:
  - `expected_cash = opening_cash + CASH sales (status<>VOID) − approved
    PARTIAL cash refunds against this shift's sales`
  - `variance = closing_cash − expected_cash`
- A non-zero variance requires a written reason or the RPC rejects.

### Summary UI

Cashier card (`ShiftSummary`) and manager modal (`ShiftDetail`) share two
cards, computed once by `buildShiftBreakdown(shift, shiftSales,
refundRequests)` in `features/shifts/service.ts`. The helper mirrors the
`close_shift` formula exactly, so the live preview converges with whatever
the RPC will write at close time.

- **Payment breakdown** — cash sales count + total, other sales count +
  total, approved cash refunds (when > 0), voided count (when > 0), total
  sales count.
- **Cash reconciliation** — opening, expected (live label
  `Expected cash (live)` while open), closing, variance. Closing and
  variance render as `—` while open.

A hint appears for open shifts with non-cash-only sales:
*"Non-cash sales don't increase expected cash. Closing cash should match
opening cash."*

## Inventory

- Stock is per-shop. The `inventory` table has composite PK
  `(shop_id, product_id)` — exactly one row per shop per product.
- Every stock change writes an `inventory_movements` row with
  `qty_before`, `qty_change`, `qty_after`. Movements are immutable.

Movement types:

| Type | Direction | Source |
| --- | --- | --- |
| `SALE_OUT` | − | `complete_sale` |
| `PURCHASE_IN` | + | `receive_purchase_order` |
| `TRANSFER_OUT` / `TRANSFER_IN` | − / + | `complete_stock_transfer` |
| `RETURN_IN` | + | refund / void approval |
| `ADJUSTMENT` | ± | `adjust_stock` (manual) |
| `DAMAGE` | − | `adjust_stock` (damage write-off) |

### Adjustment / damage

- Inventory page → Adjust Stock / Record Damage.
- `adjust_stock(...)` validates type, non-blank reason, non-zero delta,
  sign-vs-type consistency, permission (`inventory:adjust` or
  `inventory:damage`), and shop scope. It blocks negative stock unless the
  caller holds `inventory:override_negative` (NOT `pos:override_stock` —
  that's the POS-side override).
- Low-stock badge: `qtyBaseUnits <= lowStockThreshold`.
- Out-of-stock: `qtyBaseUnits <= 0` blocks POS sale unless
  `pos:override_stock`.

### Movement history

- `/app/inventory` Movements tab requires `inventory:view_movements`. A
  cashier with only `inventory:view_stock` sees current stock but not
  movement history. The SELECT RLS enforces this server-side as well.

## Purchase Orders + Supplier Debt

PO lifecycle: `DRAFT → SUBMITTED → APPROVED → RECEIVED`, with `CANCELED`
available from non-terminal states.

### Workflow

1. **Create.** `create_purchase_order(...)` — gated by `purchase:create`.
2. **Approve.** `approve_purchase_order(...)` — gated by
   `purchase:approve` (ADMIN by default; MANAGER does not approve).
3. **Receive.** `receive_purchase_order(p_purchase_order_id,
   p_received_items)` — gated by `purchase:receive`. Records received qty
   (partial supported), increases inventory, writes `PURCHASE_IN`
   movements, writes audit, sets PO `RECEIVED`. All in one transaction.
4. **Cancel.** `cancel_purchase_order(...)` — non-terminal POs only.

### Supplier debt rule

**Supplier debt starts only when the PO is RECEIVED.** Draft / submitted /
approved / canceled POs add no debt.

- Outstanding balance = `purchase_orders.total_mmk − purchase_orders.paid_mmk`
  for RECEIVED POs only.
- Supplier debt = sum of outstanding balances across the supplier's
  RECEIVED POs.

### Payments

- `record_supplier_payment(p_purchase_order_id, p_amount_mmk,
  p_payment_method, p_reference_no, p_notes)` — gated by
  `supplier:payment_create` + shop scope.
- Validates: PO status `RECEIVED`, amount `> 0`, no overpayment.
- Inserts a `supplier_payments` row, updates `purchase_orders.paid_mmk` /
  `payment_status` (`UNPAID` / `PARTIAL` / `PAID`), writes audit.
- **Does not affect cashier shift cash, POS, sales, inventory movements,
  or shifts.**

### Supplier UI

- `/app/suppliers` — list with search, financial summary columns, and a
  "View details" navigation per row.
- `/app/suppliers/:supplierId` — full detail page. Header (Back / Edit
  supplier / Create purchase order), five summary cards (Outstanding debt,
  Received purchases, Paid, Unpaid/partial POs, Last purchase), and three
  tabs:
  - **Overview** — profile card + notes.
  - **Purchase Orders** — one card per PO with status / received /
    payment / next-step hint badges, Total / Paid / Balance money grid,
    and per-PO actions. Inline expand shows ordered/received qty, unit
    cost, line total, supplier invoice no, delivery note no, approved
    at/by, and the receiving-confirmation banner.
  - **Payments** — full-width table (date, PO #, amount, method,
    reference, notes, recorded by).
- Per-PO actions follow `getPurchaseOrderActionState(po, user)`:

  | PO state | Next action button | Hint when user lacks permission |
  | --- | --- | --- |
  | DRAFT / SUBMITTED | **Approve** | "Needs approval" |
  | APPROVED | **Receive** | "Needs receiving" |
  | RECEIVED + balance > 0 | **Record payment** | "Needs payment" |
  | RECEIVED + paid | terminal | — |
  | CANCELED | terminal | — |
  | Non-terminal + has `purchase:create` | **Cancel PO** | hidden |

- Payment modal: amount defaults to outstanding balance; "Pay outstanding"
  quick-fill button; validates `0 < amount ≤ balance`; inline rose error
  banner on failure; modal refuses to close mid-submit.

## Stock Transfers

Lifecycle: `PENDING → APPROVED → COMPLETED`, with `CANCELED` and `REJECTED`
exits.

- **Create** at the source shop — `transfer:create`.
- **Approve / reject** at the destination shop — `transfer:approve`. Can
  adjust quantities (partial approval).
- **Complete** at the source shop — `complete_stock_transfer(...)`,
  permission gated by `transfer:approve` for the source shop. Locks the
  transfer + both inventory rows, rejects insufficient source stock,
  writes paired `TRANSFER_OUT` + `TRANSFER_IN` movements, updates both
  shops' stock, writes audit — all atomically. Sorted per-shop advisory
  locks prevent transfer-vs-transfer deadlocks.
- **Cancel** pending transfers — `transfer:cancel`.

## Refund / Void

- Cashier raises a request from the receipt screen
  (`create_refund_void_request`); gated by `pos:request_refund` /
  `pos:request_void`.
- Manager approves via `approve_refund_request` /
  `approve_void_request`; gated by `pos:refund` / `pos:void_sale`.
- Inventory restock + movements (`RETURN_IN`) + sale status update +
  audit row commit together.
- Reject via `reject_refund_void_request`.
- VOID restocks all items. PARTIAL restocks selected items by qty.

## Barcode Labels

- Route `/app/barcode-labels`, ADMIN + MANAGER only.
- Flow: select product → preview modal → confirm quantity (1–200) →
  choose template → live preview → **Print labels** mounts
  `BarcodePrintSheet` and calls `window.print()`.
- Templates: Compact 50×25mm, Standard 60×30mm (default), Price-focused
  60×30mm, Large 70×40mm — see `src/features/barcodes/labelTemplates.ts`.
- Barcode value: first `product_barcodes.value` → fall back to
  `product.sku` → otherwise the product cannot print a label. Same rule
  as the POS scanner (see POS Barcode Scan above).
- Renderer: CODE128 via `BarcodeSvg`.

## Products / Categories / Pricing

### Products

- `products.sku` is required in the admin UI and is generated from the
  category prefix + sequential number (e.g. `BEE-001`) and read-only.
- Product images compressed `<= 100 KB` and uploaded to the
  `product-images` Storage bucket; the row stores only the public URL.
- A phone QR upload flow uses temporary one-time tokens — see
  [06-ui-printing-hardware.md](./06-ui-printing-hardware.md) and
  [`archive/31-product-images-storage-setup.md`](./archive/31-product-images-storage-setup.md).
- Replacing an image always creates a fresh Storage object (timestamped
  path) so cache invalidation is automatic. Orphan cleanup is a known
  follow-up.

### Categories

- Icon-based via `src/features/categories/categoryIcons.ts` (18 Material
  Symbols). `Category.iconKey` is persisted in `categories.icon_key`
  (migration `017`).
- **Safe delete.** A category cannot be deleted while products reference
  it. Both the UI and the `deleteCategory` store action enforce the rule
  via `getCategoryDeleteBlockMessage`. Products are never deleted or
  auto-reassigned.
- POS filter buttons and other selectors are store-driven; no hardcoded
  category list anywhere.

### Price tiers

- Quantity-based price breaks per product (and optionally per shop).
- Admin via `/app/admin/pricing` (gated by `pricing:manage`).
- Add / Edit modal uses the shared `ProductPicker` (image thumbnail,
  category icon fallback, SKU, category badge, base price, current shop
  stock; search matches name / SKU / barcode value / category, ignores
  punctuation).
- Validation rules: tiers cannot overlap for the same product/shop;
  `minQty >= 1`; `maxQty > minQty` (or null for unlimited); `priceMmk > 0`.
- Shop-specific tiers override global tiers for the same quantity range.
- Selecting an inactive product shows the inline error
  `Selected product is no longer available.` and keeps the modal open.

## Audit

- Every operational RPC writes its own `audit_logs` row in the same
  transaction.
- Direct INSERT/UPDATE/DELETE on `audit_logs` is revoked (migration `013`).
- Reads gated by RLS (see [03-database-security.md](./03-database-security.md)).
- `log_audit_event(...)` is the only RPC dedicated to logging
  admin/reference events; it forces `actor_id` to the authenticated user
  so authorship can't be spoofed.
