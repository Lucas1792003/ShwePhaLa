# Recent Changes

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
- **One permission system.** The coarse permission system was removed; granular permission strings such as `pos:create_sale`, `product:create`, and `report:shop` are now the single source of truth.
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


