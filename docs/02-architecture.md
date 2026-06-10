# 02 · Architecture

## Tech Stack

- React 19 + TypeScript + Vite
- Zustand for in-memory UI state
- React Router 7 for navigation
- Recharts for analytics
- Tailwind CSS for styling
- Supabase Auth + PostgreSQL for identity + business data

## Folder Layout

```text
src/
  app/
    layout/          AppLayout, Sidebar, Topbar, ShopSwitcher, SmallScreenGuard
    routes/          AppRouter + RequireAuth / RequireRole guards
  components/
    ui/              Button, Card, Modal, Drawer, Badge, Toast, ErrorBoundary, …
    pos/             ProductFinder, CartPanel, PaymentModal, ReceiptPreview
    receipt/         ReceiptDetail (voucher on screen + print-only receipt)
    sales/           SalesTable, SaleVoucher, refund/void modals (SaleDetailDrawer unused)
    shifts/          Shift cards and detail views
    inventory/       Inventory UI
    products/        Reusable ProductPicker and search helpers
    dashboard/       Dashboard charts and summaries
    purchases/       PurchaseOrderCreateModal, PurchaseOrderReceiveModal
    suppliers/       SupplierFormModal, SupplierPaymentModal
    barcodes/        BarcodeSvg, BarcodeLabel, BarcodePrintSheet
  features/
    auth/, admin/, catalog/, pricing/, pos/, reports/
    suppliers/       debt math, getPurchaseOrderActionState, ui primitives
    barcodes/        labels, labelTemplates
  pages/             Page compositions used by routes (incl. SupplierDetailPage)
  hooks/             useAsyncAction, useViewportWidth, useTranslation, …
  stores/
    authStore.ts     Supabase Auth session + current app user id
    appStore.ts      Selected shop UI state (persisted to localStorage)
    languageStore.ts Language + Zawgyi/Unicode preference (persisted)
    toastStore.ts    Toast queue
    data/            Zustand domain slices + Supabase row mappers
  lib/
    permissions.ts   Central permission registry + ROUTE_PERMISSIONS
    supabase.ts      Supabase client, dbWrite / dbExec / dbAudit
    errors.ts        Central error utility + classifiers + getErrorMessage
    utils.ts         Formatting, getEffectiveShopId, normalizeAmountInput, …
  types/domain.ts    TypeScript domain model (User, Sale, Inventory, …)
  data/seedSupabase.ts  Dev-only seed; refuses to run in browser by default
supabase/
  schema.sql         Base schema
  migrations/        Ordered SQL migrations (apply in numeric order)
```

## Runtime State

| Store | Responsibility | Persisted |
| --- | --- | --- |
| `authStore` | Supabase Auth session + `currentUserId` (app `users.id`). | Auth session in localStorage via the Supabase client. |
| `appStore` | Currently selected shop. | `pos-app` in localStorage. |
| `languageStore` | Language / Zawgyi-Unicode toggle. | `pos-language` in localStorage. |
| `toastStore` | Toast queue. | — |
| `dataStore` (`stores/data/`) | In-memory cache of all Supabase domain rows, hydrated by `loadData()` after auth. | **Not persisted.** |

Older docs that called localStorage "the data store" are stale. Today
localStorage holds only the three lightweight items above.

## Data Loading

`stores/data/index.ts` composes the domain slices (shop, category, brand,
unit type, product, inventory, shift, sale, transfer, purchase, pricing,
audit). `loadData()`
fetches all relevant tables in parallel and exposes:

- `isLoading`, `isLoaded`, `loadError`
- `loadData({ force? })`
- `retryLoadData()` for the bootstrap retry surface

Each parallel query's `.error` is checked; the first failure becomes
`loadError`. `AppLayout` renders a "Couldn't load your data" Retry card
**before** falling back to the generic spinner so a failed bootstrap is
actionable instead of stuck.

## Write Model

Writes split cleanly into two paths:

1. **RPC-first (operational, money / stock / status / audit-touching).**
   Atomic `SECURITY DEFINER` functions. The slice action calls the RPC, then
   reconciles local state from the RPC's authoritative result. Lossy
   optimistic state is avoided for these flows.

   | Slice | RPCs |
   | --- | --- |
   | `saleSlice` | `complete_sale`, `create_refund_void_request`, `approve_refund_request`, `approve_void_request`, `reject_refund_void_request` |
   | `inventorySlice` | `adjust_stock` |
   | `shiftSlice` | `open_shift`, `close_shift` |
   | `purchaseSlice` | `create_purchase_order`, `approve_purchase_order`, `receive_purchase_order`, `cancel_purchase_order`, `record_supplier_payment` |
   | `transferSlice` | `create_stock_transfer`, `approve_stock_transfer`, `reject_stock_transfer`, `cancel_stock_transfer`, `complete_stock_transfer` |
   | `auditSlice` | `log_receipt_reprint`, `log_audit_event` |

2. **Direct, permission-gated writes (admin / reference).** Direct
   `supabase.from(...).insert / update` writes via `dbWrite` (fire-and-forget
   + friendly toast on failure) or `dbExec` (awaited; throws a friendly
   `Error` on failure). Applies to: `shops`, `users`, `categories`,
   `brands`, `products`, `product_units`, `product_barcodes`,
   `product_unit_prices`, `price_tiers`, `suppliers`. RLS still gates by
   permission server-side.

## Multi-Shop Model

- The `inventory` table has a composite primary key `(shop_id, product_id)`
  — stock is per-shop. Products, barcodes, categories, suppliers, and
  pricing are global / catalog-level. Brands are category-scoped catalog
  metadata used by product management, catalog browse, and POS filters.
- Every stock lookup is keyed by `(shopId, productId)` — never `productId`
  alone. The Product Management "Stock" column shows on-hand units for the
  **selected shop only**.
- Cross-shop stock aggregation only happens when an ADMIN explicitly
  chooses "All Shops" on the Dashboard / Profit reports — that's the
  intended admin aggregate, not a leak. RLS enforces this server-side.
- Admin spans all shops; MANAGER / CASHIER / BUYER are locked to their
  assigned `shop_id`.

## Identity & Permissions

- `users.auth_id` links each active staff profile to a Supabase Auth user.
- Effective permissions: `roleDefaults ∪ grantedPermissions − revokedPermissions`
  (a revoke always wins).
- Frontend helpers in `src/lib/permissions.ts`:
  `hasPermission`, `hasShopPermission`, `canAccessShop`,
  workflow helpers (`canVoidSale`, `canRefundSale`, `canAdjustInventory`,
  `canCompleteTransfer`, `canReceivePurchaseOrder`,
  `canApprovePurchaseOrder`, `canRecordSupplierPayment`).
- SQL helpers used by RLS and RPCs: `current_app_user()`, `app_role()`,
  `app_shop_id()`, `app_user_id()`, `app_has_perm(perm)`,
  `app_can_for_shop(perm, shop_id)`.

Details and per-role tables: [05-roles-permissions.md](./05-roles-permissions.md).

## Product / Inventory / Image Model

- `products.sku` is the primary catalog code (required in the admin UI).
- Product quick fields include `alias_code`, `short_name`, `max_qty`,
  `is_open_price`, `is_non_stock`, and `purchase_type`. `is_open_price`
  makes POS prompt for a cashier-entered unit price; `is_non_stock`
  bypasses inventory deduction and movement writes in `complete_sale`.
- `products.brand_id` links to `brands.id`; brands are active/inactive and
  category-scoped.
- `products.unit_type` is the base stock unit label from the Unit Types
  registry. Inventory stays in base units.
- `product_units` are product-specific sellable units (`Can`, `6 Pack`,
  `Case`) with `base_quantity`, `sale_price_mmk` (required, ≥ 0),
  `purchase_price_mmk` (nullable, ≥ 0), default/active flags, and sort
  order. POS deducts `cart qty * product_units.base_quantity`. The
  default unit always has `base_quantity = 1` — it is the smallest unit
  that other tiers convert to and the unit `inventory.qty_base_units`
  counts. Tier pricing applies only to the default unit (server enforces
  in `complete_sale`).
- `product_barcodes.product_unit_id` maps a barcode to an exact sellable
  unit; null means product/default unit.
- `product_barcodes.value` is the optional scan-code mapping used by POS.
- `product_unit_prices` stores active price-level values by
  `(product_unit_id, price_level_id, optional shop_id)`. The POS cart line
  stores the chosen price level and `complete_sale` resolves the final
  server-authoritative price.
- POS barcode scan resolves: trim → exact `product_barcodes.value` match →
  case-insensitive `products.sku` fallback. This mirrors the label
  printer's selection rule, so a SKU-source label scans back correctly.
  If a barcode row has `product_unit_id`, POS adds that exact sellable unit;
  SKU fallback always adds the default unit.
- Product images compress to `<= 100 KB` and upload to the **public
  Supabase Storage bucket `product-images`**. The `products.image_url`
  column holds only the public URL — never base64.
- A QR-based phone upload flow uses temporary one-time tokens
  (`product_image_upload_sessions`) with `sha256` storage; the phone never
  needs to log in. Expiry is 10 minutes.

## Error Handling

Friendly user-facing messages route through a single utility:

- [`src/lib/errors.ts`](../src/lib/errors.ts) — `getErrorMessage(err, fallback?)`
  plus classifiers (`isPermissionError`, `isNetworkError`,
  `isDuplicateError`, `isStorageError`, `isExpiredSessionError`,
  `isInsufficientStockError`, `isNoOpenShiftError`). Maps Postgres
  SQLSTATE codes (`42501`, `23505`, `PGRST301`), Supabase storage
  phrasing, JWT expiry, and common business-domain phrases to canonical
  friendly strings.
- `dbWrite` / `dbExec` route through the mapper, so RLS / duplicate /
  network errors never leak raw Postgres text into the UI.
- `src/hooks/useAsyncAction.ts` standardizes the save/submit pattern:
  loading state, double-submit guard, friendly toast on failure, returns
  `undefined` so callers naturally keep modals open on failure.
- Top-level [`ErrorBoundary`](../src/components/ui/ErrorBoundary.tsx)
  wraps `<AppRouter>`. "Try again" / "Reload" fallback; stack trace only
  in dev.
- `loadData` exposes `loadError` + `retryLoadData`; bootstrap shows a
  retry card instead of an infinite spinner on RLS / network failure.

QA scenarios: [08-testing-qa.md](./08-testing-qa.md) and
[`archive/34-error-handling-qa-checklist.md`](./archive/34-error-handling-qa-checklist.md).

## Routing

Routes are scoped under `/app` and protected by `RequireAuth` and
`RequireRole`. The route → permission map (`ROUTE_PERMISSIONS`) is the
single source of truth used by both the router guard and the sidebar.

| Route | Required permission |
| --- | --- |
| `/app/dashboard` | `report:shop_sales` |
| `/app/pos` | `pos:create_sale` |
| `/app/sales`, `/app/sales/:saleId` | `sales:view_own_shift` |
| `/app/shifts` | `shift:manage_own` |
| `/app/inventory` | `inventory:view_stock` |
| `/app/transfers` | `transfer:view` |
| `/app/purchases` | `purchase:view` |
| `/app/suppliers` | `supplier:read` |
| `/app/suppliers/:supplierId` | `supplier:read` |
| `/app/approvals` | `approval:view` |
| `/app/reports`, `/app/reports/profit` | `report:shop_sales` / `report:shop_profit` |
| `/app/catalog` | `product:read` |
| `/app/barcode-labels` | `product:read` + role gate (ADMIN/MANAGER) |
| `/app/admin/*` | each gated by the relevant admin permission |
| `/phone-upload/product-image/:token` | unauthenticated (token-gated) |

## Deployment

Static SPA build (`vite build`) deployed to Vercel. `vercel.json` rewrites
all routes to `index.html` for client-side routing. The browser bundle
contains the Supabase URL + anon key only — never a service-role key.

See [07-setup-deployment.md](./07-setup-deployment.md).
