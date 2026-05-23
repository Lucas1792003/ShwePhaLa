# Recent Changes

## Tablet / desktop responsiveness + small-screen guard

- **Target sizes.** Layout is now intentionally designed for tablet
  landscape and larger: 1024 × 768 (tightest), 1280 × 720, 1280 × 800,
  1366 × 768, 1440 × 900, 1536 × 864, 1920 × 1080 (main target), and
  2560 × 1440 (sanity). See
  [`docs/32-responsive-testing-checklist.md`](./32-responsive-testing-checklist.md)
  for the full matrix and per-page expectations.
- **Small-screen guard.** Viewports below 768 px now render
  `SmallScreenGuard` instead of the app chrome: *"This app is optimized for
  tablet and desktop screens. Please use a wider screen for POS
  operations."* New `useViewportWidth` hook drives it from `AppLayout`.
- **Sidebar.** Default width dropped to **220 px**; widens to **270 px**
  at `min-width: 1280px`. Sidebar header logo scales 48 → 68 at the same
  breakpoint. The old `max-width: 1024px` stack rule was moved to
  `max-width: 767px` so the 1024 tablet keeps the sidebar inline.
- **POS.** Cart `w-[320px] xl:w-[380px]`. Product grid steps
  `2 → 3 → 4` at `lg → xl → 2xl` (was crammed to `4` at `lg`).
- **Dashboard.** Top stat row `sm:grid-cols-2 lg:grid-cols-3
  xl:grid-cols-5` (was `lg:grid-cols-5`, too tight at 1024).
- **Tables.** Sales, Inventory, Movements, Shifts, and Audit table
  wrappers switched from `overflow-hidden` to `overflow-x-auto` with
  meaningful `min-w-*` — columns scroll horizontally if needed instead of
  clipping silently.
- **No backend changes.** Frontend layout only; no RPC/RLS/permission
  changes.

## Receipt / sales detail unification + drawer redesign

- **Single source of truth.** New
  [`src/components/receipt/ReceiptDetail.tsx`](../src/components/receipt/ReceiptDetail.tsx)
  is the only receipt-detail surface — used by the route
  `/app/sales/:saleId` (POS post-payment + "Open full receipt") and by
  the Sales History drawer. Includes the 80 mm `ReceiptPreview`, reprint
  log, Request actions card (with *"Requests require manager approval"*
  helper), and a Pending approvals card.
- **`variant` prop.** `"page"` (default) renders the full `PageHeader`
  with Print/Reprint as header actions plus a Back link; `"drawer"`
  swaps to a compact inline toolbar so the same body lives cleanly
  inside the redesigned drawer.
- **Sales History drawer.** Restored as
  [`src/components/sales/SaleDetailDrawer.tsx`](../src/components/sales/SaleDetailDrawer.tsx)
  wrapping the shared `Drawer` primitive. Sticky header with
  `Receipt {receiptNo}` + status badge + payment method, scrollable
  body, sticky footer "Open full receipt →" link that routes to the
  page version. Filter context is preserved (the list page no longer
  navigates on row-click).
- **Drawer primitive.** Upgraded with sticky header (real
  `material-symbols-rounded close` icon, `aria-label="Close"`),
  scrollable body, sticky footer, and responsive width
  (`w-full sm:max-w-lg`).
- **SalesTable.** Replaced the implicit clickable-row pattern with an
  explicit **"View receipt"** action column; added a Payment column.
- **Permission gating.** Request actions now gate on
  `pos:request_void` / `pos:request_refund` (not on `role === CASHIER`),
  so managers can also request through the same UI. Approve buttons
  appear only with `pos:void_sale` / `pos:refund`. Cashiers can reprint
  via `log_receipt_reprint` (gated on `receipt:reprint`). No RLS change.
- **Payment modal default.** `Amount received` now opens at **0**
  every time the modal opens (was pre-filled with the total). Confirm
  stays disabled until ≥ total; the shared `Input` selects-on-focus so
  typing replaces the 0 instantly.

## Shift summary UI parity + cashier sales history

- **Shift summary UI bug fixed.** The manager `ShiftDetail` modal used to
  render `expected_cash_mmk ?? 0` straight from the row; for an **open** shift
  those columns are still `NULL` (only `close_shift` writes them), so the
  modal showed `Expected cash: MMK 0` next to `Sales count: 1` even when a
  cash sale existed. No backend / RLS / RPC change — the fix is UI-only.
- **Live expected cash for open shifts.** Both the cashier card
  (`ShiftSummary`) and the manager modal (`ShiftDetail`) now compute
  expected cash live from the shift's sales using the same formula as the
  `close_shift` RPC:
  `opening_cash + CASH sales (status<>VOID) − approved PARTIAL cash refunds`.
- **Shared helper, single source of truth.** Added
  `buildShiftBreakdown(shift, sales, refunds)` in
  `features/shifts/service.ts`. Both components and the cashier-page close
  handler consume it, so the live preview, the manager modal, and the local
  variance prompt cannot drift from one another. `ShiftSummary` and
  `ShiftDetail` take a precomputed `breakdown` prop; the parent pages call
  the helper once per render.
- **New summary layout.** Two cards on every shift summary:
  *Payment breakdown* (cash / other counts + totals, approved cash refunds
  if any, voided sales count if any, total sales count) and
  *Cash reconciliation* (opening, expected, closing, variance). For an open
  shift, closing and variance render as `—` and expected cash is labeled
  `(live)`; once the shift is closed the server-stored values are shown.
- **Cashier sales history.** `ROUTE_PERMISSIONS.sales` changed from
  `sale:view` → `sales:view_own_shift` so a cashier can navigate to
  `/app/sales`. Row scope is still enforced by the `sales_sel` RLS in
  migration `015`; `SalesPage` mirrors it on the client (narrows to
  `cashierId === currentUserId`, hides the cashier filter, switches
  "Void sale" → "Request void", hides Approve buttons unless the caller has
  `pos:refund` / `pos:void_sale`). Added a Payment column to `SalesTable`.
  Reprint still goes through `log_receipt_reprint`; refund/void still go
  through `create_refund_void_request`. No RLS change.

## Shared categories everywhere + safe category delete
- **Safe delete (Option A).** A category can no longer be deleted while
  products use it. New shared helper `src/features/categories/categoryUsage.ts`
  (`getCategoryDeleteBlockMessage`) is enforced both in the UI
  (`handleDeleteCategory`) and in the data layer (`deleteCategory` store action
  now throws). Blocked message: *"This category is used by X product(s). Move
  or edit those products before deleting the category."* Products are never
  deleted or auto-reassigned. Products reference a category **by name**
  (`product.category`), so usage is counted by name.
- **No more hardcoded category filters.** The Inventory stock filter, the
  read-only Products catalog filter, and the POS cart-row icon all now derive
  from the shared categories store / icon resolver — a category created in
  Product Management appears in every filter with no reload. (POS filter
  buttons and the Product-Management/product-form selectors were already
  store-driven.)

## Icon-based product categories
- **Central icon registry.** Added `src/features/categories/categoryIcons.ts`
  — 18 category icons (Material Symbols, the app's existing icon system; not
  lucide-react, which is not a dependency). `resolveCategoryIcon(iconKey, name)`
  resolves by explicit key → category-name alias → default.
- **Category model.** `Category` gains optional `iconKey`; migration
  `017_category_icon_key.sql` adds `categories.icon_key text`. `color` is kept
  (now only a visual accent). Old rows with no `icon_key` resolve an icon from
  their name, so nothing breaks.
- **Category management UI.** Cards now lead with the category icon (color is a
  small tile accent, no longer a full-card tint). The add/edit modal has an
  icon picker grid; the chosen `iconKey` is persisted.
- **POS.** Category buttons now render the real store categories through the
  shared resolver (was a hardcoded 4-item list). "All" keeps its grid icon;
  the product-card placeholder also uses the resolver.

## Product images moved to Supabase Storage
- **No more base64 on product rows.** The product create/edit flow now uploads
  the compressed photo to the Supabase Storage bucket `product-images` and
  saves only the **public URL** in `products.image_url`. Base64 data URLs are
  no longer written.
- **New helper.** `src/lib/productImageStorage.ts` — `uploadProductImage()`
  uploads the `compressProductImage` blob (still `<= 100 KB`) to
  `products/<productId>/<timestamp>.<ext>` and returns the public URL;
  `buildProductImagePath()` builds the deterministic path.
- **Bucket + policies.** Added `016_product_images_storage.sql` — a public
  `product-images` bucket and `storage.objects` policies (public read; insert/
  update/delete gated by `app_has_perm('product:create' | 'product:update')`).
  Setup steps in `docs/31-product-images-storage-setup.md`.
- **UI.** `ProductImageInput` shows a Compressing → Uploading state, the
  compressed size, and a friendly error if the upload fails (the product is
  never saved with a broken image). Display is unchanged — `<img src>` loads
  the Storage URL.
- **Follow-up.** Replacing/removing an image does not delete the old Storage
  object yet; orphan cleanup is documented as a follow-up.

## Inventory shop-scoping audit
- **Audit result.** Reviewed the data model, RPCs, RLS, store slices and every
  inventory read across the app. The architecture is correct: products are a
  shared catalog, but `inventory` is one row per `(shop_id, product_id)`
  (composite primary key), and `complete_sale`, `receive_purchase_order`,
  `complete_stock_transfer`, `adjust_stock` and the refund/void RPCs all
  read/write inventory keyed by `shop_id` + `product_id`.
- **Bug fixed.** `ProductsManagePage` (admin Product Management) computed its
  "Stock" column by summing `qty_base_units` across **all shops** into one fake
  global quantity. It now shows on-hand units for the **currently selected
  shop** only, with the shop name printed under the column header; the low/out
  badges and `lowStockThreshold` check are now per-shop.
- **Sanctioned aggregates.** The Dashboard and `ProfitReportsPage` still sum
  stock across shops, but only when an ADMIN explicitly selects "All Shops" —
  this is the intended admin aggregate, not a leak.
- **Tests.** Added `src/features/inventory/selectors.test.ts` (11 tests):
  per-shop stock independence, "no global collapse", RPC SQL inventory writes
  keyed by `(shop_id, product_id)`, and the composite-PK schema check.

## RBAC follow-up - permission-gated RLS, dashboard gating, docs sync
- **Permission-gated SELECT RLS.** Added `015_permission_gated_select_rls.sql`.
  SELECT policies on sensitive tables (`sales`, `sale_items`, `inventory`,
  `inventory_movements`, `shifts`, `purchase_orders`, `purchase_order_items`,
  `stock_transfers`, `stock_transfer_items`, `refund_void_requests`,
  `reprint_logs`, `audit_logs`) now check a **permission** in addition to shop
  scope. A same-shop cashier can no longer read every shop sale, movement
  history or audit log directly through the API — only its own sales/shift
  rows. Child tables are readable iff their parent is. Adds the `app_user_id()`
  identity helper. Write policies, REVOKEs and the RPC architecture are
  unchanged.
- **Dashboard profit gating.** `DashboardPage` profit / cost / margin /
  investment cards, the profit-trend + goal-tracker row and the sales-trend
  chart now require `report:shop_profit`; the inventory cards require
  `report:shop_inventory`. A manager no longer sees profit/cost on the
  dashboard unless explicitly granted `report:shop_profit`.
- **BUYER is per-shop.** The Users page now requires a shop for every non-admin
  role, including BUYER, so a BUYER can actually create/view shop-scoped
  purchase orders. A shopless BUYER is a misconfiguration.
- **Docs.** `01-roles-permissions.md`, `02-routing-navigation.md` and
  `06-inventory-flow.md` updated to the tuned matrix; added
  `docs/30-rls-permission-gating-checklist.md`.

## RBAC role tuning - migration 014
- **Less over-permissive roles.** Added `014_rbac_role_tuning.sql`, which
  replaces `role_default_permissions()` with tuned defaults and remaps renamed
  permissions inside existing per-user grant/revoke arrays.
- **Split permissions.** `inventory:read` -> `inventory:view_stock` +
  `inventory:view_movements`; `report:shop` -> `report:shop_sales` +
  `report:shop_inventory`; `report:profit` -> `report:shop_profit`. New:
  `inventory:override_negative`, `pos:request_refund`, `pos:request_void`,
  `sales:view_own_shift`, `receipt:reprint`, `report:own_shift`.
- **CASHIER narrowed** to POS + own shift; **MANAGER** loses profit by default;
  **BUYER** becomes a per-shop catalog + purchasing role.
- **RPC checks.** `adjust_stock` now checks `inventory:override_negative` for
  the negative-stock override; `create_refund_void_request` checks
  `pos:request_void`/`pos:request_refund`; `log_receipt_reprint` checks
  `receipt:reprint`.

## Backend hardening - Script 3F: shift open / close RPCs
- **Atomic shift lifecycle.** Added `009_shift_rpc.sql` with `open_shift()`
  and `close_shift()` SECURITY DEFINER functions.
- **Open-shift safety.** Shift opening now validates authenticated app
  identity, `shift:manage_own` / `shift:manage_all`, shop scope, non-negative
  opening cash, and one open shift per cashier. The migration attempts a
  partial unique index on `(cashier_id, shop_id)` where `ended_at IS NULL`.
- **Close-shift accountability.** Shift closing recomputes expected cash
  server-side as opening cash + committed cash sales - approved cash partial
  refunds, calculates variance server-side, and requires a variance reason when
  the variance is non-zero.
- **Frontend flow.** `shiftSlice.startShift()` and `shiftSlice.endShift()` now
  call RPCs and reconcile shift/audit state only after success. Shift page
  surfaces RPC errors as toasts and prompts for a variance reason when needed.
- **Checklist.** Added `docs/24-script-3f-shift-rpc-tests.md`.

## Backend hardening - Script 3E: inventory adjustment RPC
- **Atomic adjustment.** Added `008_adjust_stock_rpc.sql` with `adjust_stock()`
  as a SECURITY DEFINER function for manual adjustment / damage write-off.
- **Validation.** The RPC checks the adjustment type, a non-blank reason, a
  non-zero delta, the sign-vs-type, `inventory:adjust` / `inventory:damage`
  permission and shop scope, and blocks negative stock without
  `pos:override_stock`.
- **Frontend.** `inventorySlice.adjustStock` / `recordDamage` call the RPC and
  reconcile inventory, movement and audit state only after success. No side
  effects remain inside the Zustand `set()` callback.
- **Checklist.** Added `docs/26-script-3e-adjust-stock-rpc-tests.md`.

## Backend hardening - Script 3D: stock transfer completion RPC
- **Atomic completion.** Added `007_complete_stock_transfer_rpc.sql` with
  `complete_stock_transfer()` as a SECURITY DEFINER function.
- **Inventory ledger.** Deducts source stock, adds destination stock (creating
  the row if needed), rejects insufficient source stock, and writes paired
  `TRANSFER_OUT` / `TRANSFER_IN` movements — all atomically. Sorted per-shop
  advisory locks prevent transfer-vs-transfer deadlocks.
- **Frontend.** `transferSlice.completeTransfer` calls the RPC and reconciles
  transfer, items, inventory, movements and audit state after success.
- **Checklist.** Added `docs/25-script-3d-complete-stock-transfer-rpc-tests.md`.

## Backend hardening - Script 3C: purchase receiving RPC
- **Atomic receiving.** Added `006_receive_purchase_order_rpc.sql` with
  `receive_purchase_order()` as a SECURITY DEFINER function.
- **Inventory ledger.** Records received quantities, increases inventory
  (creating rows as needed), writes `PURCHASE_IN` movements, and marks the PO
  `RECEIVED` — all atomically. Partial receiving is supported.
- **Frontend.** `purchaseSlice.receivePurchaseOrder` calls the RPC and
  reconciles PO, items, inventory, movements and audit state after success.
- **Checklist.** Added `docs/24-script-3c-receive-purchase-order-rpc-tests.md`.

## Backend hardening - Script 3B: refund / void approval RPCs
- **Atomic approvals.** Added `005_refund_void_rpc.sql` with
  `approve_refund_request()` and `approve_void_request()` SECURITY DEFINER
  functions.
- **Approval safety.** The RPCs validate authenticated app identity, pending
  request state, sale state, granular permissions, and shop access through the
  SQL helpers from migration `003`.
- **Inventory ledger.** Refund and void approvals lock inventory rows, restore
  stock according to the current business logic, and insert `RETURN_IN`
  movement rows with before/after quantities.
- **Audit trail.** Approval RPCs insert `REFUND` or `VOID_SALE` audit rows in
  the same transaction.
- **Frontend flow.** `saleSlice.approveRefund()` now calls the relevant RPC and
  reconciles sale, request, inventory, movement, and audit state only after
  success. Approval errors are shown as toasts.
- **Receipt uniqueness.** Migration `005` attempts to add a unique index on
  `(shop_id, receipt_no)` and skips it with a notice if duplicate existing data
  would block the index.
- **Checklist.** Added `docs/23-script-3b-refund-void-rpc-tests.md`.

## Backend hardening - Script 3A: POS checkout RPC
- **Atomic checkout.** Added `004_complete_sale_rpc.sql` with
  `complete_sale()` as a SECURITY DEFINER function.
- **Server-side validation.** Checkout now validates the authenticated app
  user, `pos:create_sale`, shop scope, cashier shift, product state, inventory
  rows, stock override permission, and price override permission.
- **Inventory safety.** Inventory rows are locked before stock deduction; sale,
  items, inventory, movements, and audit rows commit or roll back together.
- **Frontend flow.** `saleSlice.createSale()` now calls `complete_sale()` and
  no longer performs independent sale checkout writes. POS clears the cart and
  opens the receipt only after RPC success.
- **Checklist.** Added `docs/22-script-3a-checkout-rpc-tests.md`.

## Backend hardening - Script 2: RBAC overhaul
- **One permission system.** The coarse permission system was removed; granular permission strings such as `pos:create_sale`, `product:create`, and `report:global` are now the single source of truth.
  `src/lib/permissions.ts` is the central registry.
- **Grant / revoke model.** Custom user permissions are no longer a flat
  replacement list. Effective = `roleDefaults ∪ granted − revoked`; a revoke
  always wins. `User` gains `grantedPermissions` / `revokedPermissions`.
- **Shop-aware checks.** New helpers `canAccessShop`, `hasShopPermission`, and
  workflow helpers (`canVoidSale`, `canAdjustInventory`, `canCompleteTransfer`,
  …). `requirePermission` accepts an optional `shopId`; transfer and purchase
  slices enforce shop scope.
- **Route guards & sidebar** now resolve through granular permissions via a
  shared `ROUTE_PERMISSIONS` map.
- 5 new permissions: `barcode:manage`, `sale:view`, `purchase:view`,
  `pricing:manage`, `approval:view`.
- Migrations `002_rbac_permissions.sql` (grant/deny columns + backfill) and
  `003_identity_rls_helpers.sql` (SQL helpers for RLS/RPC checks) added.
- Vitest added; `src/lib/permissions.test.ts` covers the permission model.

## Backend hardening - Script 1.5: identity linking + persistence
- **Identity linking.** `users.auth_id` links app users to Supabase Auth
  accounts. `authStore` resolves the current user through `auth_id` (with an
  email fallback that self-heals the link). Migration
  `001_identity_linking.sql`.
- **Stopped data loss.** Stock transfers, purchase orders, suppliers, and price
  tiers now persist to Supabase (they were previously memory-only and lost on
  reload).
- **Safer writes.** New `dbExec` (awaited, throws on failure) and `dbAudit`
  (awaited, non-fatal) helpers. Touched slices await their writes and only
  update local state after the database confirms.

## Supabase backend migration
- Replaced the frontend-only data layer with **Supabase** (PostgreSQL + Auth).
- `src/lib/supabase.ts` holds the client and the `dbWrite()` fire-and-forget
  write helper (logs to console + shows an error toast on failure).
- `dataStore` loads all tables on startup via `loadData()`. Current critical operational writes use RPCs; admin/reference writes still use direct permission-gated Supabase writes.
- Authentication moved to Supabase Auth (email + password). First login on an
  empty database creates the initial `ADMIN` account.
- `supabase/schema.sql` defines the base tables. Migrations now add RPCs and locked-down RLS policies for protected operational workflows.

## Product form
- **SKU auto-generation** — SKU is generated from the category prefix plus a
  sequential number (e.g. `BEE-001`) when a category is selected. The field is
  read-only; users cannot edit it.
- **Barcode section removed** — barcode entry was dropped from the product form
  (barcode data is represented by the SKU).
- Price / cost / pack-size / threshold inputs use `type="text"` +
  `inputMode="numeric"` so the default `0` is selected on focus and replaced as
  you type.

## Inventory
- Stock writes use `dbWrite` for visible error reporting.
- The `inventory` upsert passes `onConflict: "shop_id,product_id"` so it updates
  the existing row instead of failing the composite-key constraint.
- `loadData()` ensures `currentShopId` always points to a shop that exists.

## Receipt page
- Falls back to a generic shop object when a sale's `shopId` has no matching
  shop, instead of rendering a blank page.

## UI / i18n
- Category color palette expanded to 12 colors.
- Language auto-detects Zawgyi vs Unicode from the system font on first load;
  the switcher exposes a Unicode/Zawgyi toggle.
- Dashboard sales-trend chart shows real data only (no fabricated trend).
- Staff-creation form on the Users page disables browser autofill.

## Inputs
- The shared `Input` component selects its contents on focus, so default values
  are replaced immediately when typing.


