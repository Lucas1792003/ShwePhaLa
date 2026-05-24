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

### Who can open / close

`/app/shifts` is a single unified page for every role that holds
`shift:manage_own`. Both `open_shift` and `close_shift` (migration 009)
accept callers who hold `shift:manage_own` OR `shift:manage_all` for the
target shop — ADMIN and MANAGER hold both by default, CASHIER holds only
`manage_own`. Whoever opens the shift becomes its `cashier_id` (admin /
manager / cashier may all act as the cashier of record).

| Role | Open / close their own shift in | Target shop comes from |
| --- | --- | --- |
| ADMIN | any shop | the shop switcher (explicit pick required — no fallback) |
| MANAGER | their assigned shop | `users.shop_id` |
| CASHIER | their assigned shop | `users.shop_id` |

ADMIN with no shop selected sees `Select a shop to open a shift. Pick one
from the shop switcher at the top of the page.` and the open-shift form
is hidden. The `open_shift` RPC also rejects a blank `shop_id` with
`Shop is required` (009:65). There is no auto-created fallback shop.

Backend enforces "one open shift per cashier globally" via the partial
unique index `shifts_one_open_per_cashier_shop` plus an advisory lock —
the same admin cannot have two open shifts in two different shops.

### Open

- `open_shift(p_shop_id, p_opening_cash_mmk)` writes `opening_cash_mmk`
  and `started_at`. `expected_cash_mmk`, `closing_cash_mmk`, and
  `variance_mmk` remain `NULL` until close.
- A shift is required for POS checkout.

### Close

- `close_shift(p_shift_id, p_closing_cash_mmk, p_variance_reason)`
  recomputes server-side:
  - `expected_cash = opening_cash + CASH sales (status<>VOID) − approved
    PARTIAL cash refunds against this shift's sales`
  - `variance = closing_cash − expected_cash`
- A non-zero variance requires a written reason or the RPC rejects.
- MANAGER / ADMIN closing on behalf of someone else still has to satisfy
  `app_can_for_shop('shift:manage_all', shift.shop_id)` — `manage_own`
  alone is not enough.

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

### Shift Records tab

Default tab of `/app/shifts`. Lists shifts the operator is allowed to
see — RLS (migration 015) is the authority, the client filter just
mirrors it:

| Role | Rows | Filters |
| --- | --- | --- |
| ADMIN | All shifts in all shops | Shop + User |
| MANAGER | Shifts in `users.shop_id` | User |
| CASHIER | Own shifts (`cashier_id = self`) | — |

Each row shows user, role, shop, started, live duration, status. CSV
export uses whatever the current filter resolves to.

### Work Hours tab

Driven by helpers in `src/features/shifts/workHours.ts`. Same
row-visibility scope as Records (RLS, mirrored by the client).

Sections:

1. **Active shifts** — cards for every currently-open shift visible to
   this operator, with a live `Xh Ym so far` calculated from
   `now - startedAt`. Ticks every 60 s.
2. **Monthly totals** — per `(user, shop)` for the picked month: shift
   count, open count, total hours.
3. **Daily records in <month>** — every shift in the picked month with
   started/ended/duration/status.

A `Total this month` chip in the filter row shows the sum of all visible
hours for the picked month.

**Attribution rule (MVP).** A shift is attributed to the local calendar
month its `startedAt` falls in. A shift that crosses midnight into a new
month still counts entirely for its starting month. This matches the way
`close_shift` anchors cash reconciliation on `opening_cash` captured at
`startedAt`. If you ever need to split duration across calendar months,
update `isShiftInMonth` / `getMonthlyShiftHoursMs` together with their
tests in `workHours.test.ts`.

**Durations.** Closed shift = `endedAt - startedAt`. Open shift =
`now - startedAt`. Negative / invalid dates clamp to `0`. Format
`Xh Ym` rounded DOWN to the minute (so a 119-second shift shows
`0h 1m` once it ticks).

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
- Package barcodes are managed in the same product modal via a dedicated
  `Scan barcode` button that opens `BarcodeScanModal`
  (`src/components/forms/BarcodeScanModal.tsx`). The scan modal auto-
  focuses a single input, refocuses on any blur, captures both Enter
  and Tab as scan terminators (event default + propagation stopped so
  the outer product form never accidentally submits), and offers an
  `Add manually` fallback for keyboard entry. On a successful capture
  it returns the normalized value to the page handler, which runs
  `checkBarcodeAddable` (in-form duplicate → cross-product duplicate)
  and either rejects (modal stays open, inline error) or appends to
  `formBarcodes` and toasts `Barcode added`. On save the page calls
  `replaceProductBarcodes(productId, rows)` — a delete-then-insert
  reconcile that throws on the DB unique index
  `product_barcodes_unique_normalized_value` (migration 023) and shows
  `A barcode with this value is already linked to another product.`
  inline. Validation is normalize → trim + scanner control-char strip,
  length 4–64, no internal whitespace, case-insensitive uniqueness.
  The page is gated on `product:create` (ADMIN), so CASHIER / BUYER
  never reach this editor.
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

## No-Shop-Selected Policy (ADMIN)

The app never auto-creates a shop and never silently picks one for an
admin. Shop creation lives **only** in the Shops management page
(`/app/admin/shops` → `addShop` slice → direct `shops` INSERT gated by
`shop:create`). No login, bootstrap, `loadData`, dashboard, POS, shift,
or shop-switcher path creates a shop.

Shop names and shop codes are unique at the database level after
`lower(trim(...))` normalization. The Shops management form trims name,
code, and address before saving, blocks duplicate normalized names/codes
before submit, and maps database unique-index failures to friendly form
errors. Existing duplicate rows must be renamed manually before migration
`022_unique_normalized_shops.sql` can be applied; the app must not delete
or merge shop rows automatically because operational data may reference
those shop IDs.

Shop deletion is supported only for shops with no operational data. The
Delete button on `/app/admin/shops` is gated on `shop:delete` (ADMIN by
default) and pre-checks references across `users`, `inventory`, `shifts`,
`sales`, `purchase_orders`, `supplier_payments`, `stock_transfers`,
`price_tiers`, `refund_void_requests`, and `audit_logs` using the loaded
store data. If any references exist the button is disabled and a
`References: …` summary is shown. The DB FK constraints on `users`,
`inventory`, `supplier_payments`, and `price_tiers` are the final guard:
any leftover reference triggers Postgres `23503`, which the slice maps to
`This shop is still referenced by operational data.` and the form keeps
the row. The `currentShopId` is cleared if the deleted shop was selected.

`getEffectiveShopId(user, currentShopId, shops)` returns the admin's
explicitly-picked shop (or, for non-admins, their assigned `shopId`).
It returns **`""` when an admin has not picked a shop** — no `shops[0]`
fallback. Shop-scoped pages key off that:

| Page | No-shop behavior |
| --- | --- |
| POS (`/app/pos`) | Renders only `Select a shop to use POS. Sales and inventory are shop-specific.` |
| Shift (`/app/shifts`) | Renders only `Select a shop before opening a shift.` |
| Inventory (`/app/inventory`) | Shows a banner `Select a shop before adjusting inventory.` and disables the per-row Adjust action |
| Dashboard | Continues to render — admin uses its own "all / per-shop" toggle |
| Shop switcher | Shows `Select a shop` placeholder option (disabled once chosen) |

Backend RPCs reject blank shop_id explicitly so a frontend regression
never produces a corrupt row. The guard is in:

- `complete_sale` (`004`), `open_shift` (`009`), `adjust_stock` (`008`/`014`).
- `create_purchase_order` and `create_stock_transfer` (added in `021`).

POS cart safety: if the selected shop changes mid-session, the cart,
discount, payment modal, and price-override modal are all cleared. A
cart rung up against shop A can never check out against shop B.

## Dashboard

`/app/dashboard` is gated by `report:shop_sales`. ADMIN gets an all-shop
business dashboard with an All Shops / single-shop selector. MANAGER is
locked to the assigned shop and sees operational cards first. CASHIER
still has no default route access, but if `report:shop_sales` is granted
explicitly the page shows only own-shift data. BUYER has no dashboard by
default; if sales reporting is explicitly granted, the view remains
assigned-shop scoped and profit still requires `report:shop_profit`.

### Single source of truth for formulas

Every dashboard card/chart/table reads from pure helpers in
`src/features/dashboard/dashboardMetrics.ts` (covered by
`dashboardMetrics.test.ts`). The page does not inline KPI arithmetic.
The date range selector (`Today`, `Week`, `Month`) filters sales-based
cards/lists/charts; current-state action cards such as low stock,
approved PO receipts, open shifts, transfers, and supplier debt stay
visible until resolved.

### Card formulas

| Card / chart | Formula | Scope / gate |
| --- | --- | --- |
| Revenue / Today Revenue | `calculateNetRevenue = sum(sale.totalMmk) - approved PARTIAL refund amounts` for `NORMAL` sales in range | ADMIN all/selected shop; MANAGER assigned shop; CASHIER own shift only |
| Total Orders / Today Orders | `calculateSalesCount` of ranged `NORMAL` sales | VOID and REFUNDED excluded by `scopeSales` |
| Avg Order Value | `round(net revenue / order count)` | Returns 0 for empty data; whole MMK only |
| Profit / Margin | `revenue - calculateCostOfGoods`; margin = `profit / revenue * 100` | Requires `report:shop_profit`; ADMIN by default |
| Cost of goods | `sum(current product.costMmk * sale item qty)` | Profit-only approximation; sale items do not capture historical cost |
| Revenue, Cost & Profit Trend | `calculateDailyRevenueCostProfitTrend`, grouped by day; revenue is net revenue, cost is current product-cost approximation, profit = revenue - cost | ADMIN analytics; requires `report:shop_profit`; All Shops aggregates, selected shop filters. Rendered as a 3-series smooth LineChart with compact chip legend top-right and MMK-formatted Y-axis ticks (`MMK 60k`); ranges with fewer than 2 grouped days show the data as dots with the hint `More days of sales are needed to show a trend.` (e.g. a single-day Today range with sales). Cost approximation uses `product.costMmk` — sale items don't yet store historical unit cost. |
| Active Shift / Expected Cash | open shifts in scope; `opening cash + CASH sales(status != VOID) - approved PARTIAL cash refunds` | MANAGER assigned shop; ADMIN selected/all; CASHIER own shift |
| Action Needed | low stock + out of stock + requested approvals + approved PO receipts + pending transfers | Each sub-count is only rendered when the matching permission exists |
| Sales by Category | `calculateSalesByCategoryPercent`; `sum(sale_items.lineTotalMmk)` by `product.category`, then percent of category total | ADMIN all/selected shop; MANAGER assigned shop; line basis does not allocate cart-level discounts yet |
| Top Selling Products | `calculateTopProducts`, ranked by line revenue, limit 5 | Cost/profit columns are not shown unless `report:shop_profit` |
| Inventory Intelligence (Admin) | `useDashboardInsights` → stock health summary (healthy / low / out), fast / slow movers (last-7-day avg-daily-sales velocity), reorder suggestions (low + <=7d to stockout, OR out + had sales). Sales velocity window is fixed at 7 days regardless of the page range so "fast mover" stays comparable across range changes. Days-of-stock returns `null` for products with no recent sales (rendered as `n/a`, never a fake `999d`). Scope respects ADMIN All Shops vs selected shop via `metricShopId`. | Requires `report:shop_inventory`. Overlaps in spirit with the Action Queue counts (out / low) but kept because the card stands on its own and adds Fast/Slow Movers + Reorder Suggestions that aren't surfaced anywhere else. |
| Low Stock / Inventory Alerts | `calculateLowStock` per `(shop_id, product_id)` | Requires `report:shop_inventory`; all-shops never sums quantities across shops |
| Pending Refund/Void Approvals | `refund_void_requests.status = REQUESTED` | Requires `approval:view` |
| Pending PO Receipts | `purchase_orders.status = APPROVED` | Requires `purchase:view`; receiving action still requires `purchase:receive` elsewhere |
| Pending Transfers | `stock_transfers.status = PENDING` where shop is source or destination | Requires `transfer:view` |
| Supplier Debt | RECEIVED POs only; `sum(totalMmk) - sum(paidMmk)`, floored at 0 | Requires `supplier:debt_view`; unpaid and partial received POs only |
| Cash vs Other Sales | ranged valid sales split by `paymentMethod` | Manager assigned shop |
| Shop Performance | per-shop revenue, orders, AOV, open shifts, debt; profit/margin if allowed | ADMIN dashboard |
| Revenue by Shop | Shop Performance revenue by shop | ADMIN dashboard |
| Active Staff / Open Shifts | open shifts decorated with user and shop | ADMIN dashboard |
| Recent Audit Activity | recent `audit_logs` in selected range/scope | Requires `audit:view_global` |
| Recent Sales | newest ranged valid sales in scope | No profit shown unless a profit-gated card explicitly renders it |

The Admin trend chart is profit-sensitive: revenue uses `sale.totalMmk`
for `NORMAL` sales, approved PARTIAL refunds are subtracted when present,
cost/investment uses current `products.costMmk * sale_items.qtyUnits`, and
profit is `revenue - cost`. This is an approximation until sale items
store historical unit cost. Sales by Category is safe for managers because
it is sales mix only; it uses line totals and does not allocate cart-level
discounts back to categories yet.

### Shop scope per role

| Role | Sees |
| --- | --- |
| ADMIN | All Shops aggregate by default, or one selected shop |
| MANAGER | Assigned shop only; shop selector is disabled |
| CASHIER | No default access; if explicitly granted dashboard access, own shift / own sales only |
| BUYER | No default access; sales/profit remain hidden unless matching report permissions are explicitly granted |

### Sensitive card gating (mirrors RLS)

| Permission | Cards / columns gated |
| --- | --- |
| `report:shop_profit` | Profit, margin, cost, and any profit/cost columns |
| `report:shop_inventory` | Inventory Alerts / Low Stock |
| `supplier:debt_view` | Supplier Debt cards and debt groupings |
| `approval:view` | Pending refund/void approvals |
| `purchase:view` | Pending PO receipts |
| `transfer:view` | Pending transfers |
| `audit:view_global` | Recent Audit Activity |
| `report:shop_sales` | Route guard (entire dashboard) |

## User Management

`/app/admin/users` (ADMIN-only by route, gated by `user:create` /
`user:update` permissions in RLS). The form enforces, in this order, the
rules baked into migration `020`:

- **ADMIN role hidden once an admin exists.** Editing the existing admin
  is the only place ADMIN stays selectable.
- **MANAGER picker:** the shop dropdown disables any shop that already has
  an active manager *other than the row being edited* and shows the hint
  `This shop already has a manager. Deactivate or reassign the existing
  manager first.` next to it.
- **CASHIER picker:** the shop dropdown enables only shops with an active
  manager and shows `Manager: <name>` inline. Shops without a manager
  carry the hint `No active manager assigned`. If no shop has a manager
  yet, the picker shows `No shop has an active manager yet. Create a
  manager first.`
- **BUYER:** shop selection is required (shopless BUYER cannot do anything
  because the purchase permissions are shop-scoped).
- **Submit:** preflight validation runs first and shows a single inline
  error. If the DB still rejects the write (race conditions, stale UI),
  `mapUserFormError` from `src/features/admin/userFormErrors.ts`
  translates the Postgres / trigger error to the same canonical message
  set. The modal stays open on failure so the operator can fix the input
  and retry.
- **Deactivate / demote a manager:** the trigger blocks the change when
  the shop still has active cashiers (without another active manager to
  replace them). Friendly error: `Cannot remove the only manager of this
  shop while active cashiers remain. Reassign or deactivate the cashiers
  first, or assign another manager.`

## Audit

- Every operational RPC writes its own `audit_logs` row in the same
  transaction.
- Direct INSERT/UPDATE/DELETE on `audit_logs` is revoked (migration `013`).
- Reads gated by RLS (see [03-database-security.md](./03-database-security.md)).
- `log_audit_event(...)` is the only RPC dedicated to logging
  admin/reference events; it forces `actor_id` to the authenticated user
  so authorship can't be spoofed.
