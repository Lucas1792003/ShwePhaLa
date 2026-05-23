# Architecture

## Folder Structure

```text
src/
  app/                 app shell, layout, route guards
  components/          shared UI and feature components
  features/            route-level feature wrappers and helpers
  pages/               legacy/standalone page compositions
  stores/              Zustand stores
  lib/                 Supabase client, permissions, formatting utilities
  types/               domain types
  data/                seed/dev data references
supabase/
  schema.sql           base schema
  migrations/          ordered database migrations and RPCs
docs/                  project documentation
```

## Runtime State

- `authStore`: Supabase Auth session and current app user id.
- `appStore`: selected shop UI context, persisted in localStorage.
- `languageStore`: language and font preference, persisted in localStorage.
- `toastStore`: toast queue.
- `dataStore`: in-memory domain cache loaded from Supabase.

`dataStore` is not persisted to localStorage. `loadData()` reads Supabase tables
and row mappers convert database `snake_case` to TypeScript `camelCase`.

## Write Architecture

Operational writes that affect money, stock, shifts, status, or audit history
are RPC-based:

- `saleSlice`: `complete_sale`, refund/void request and approval RPCs.
- `inventorySlice`: `adjust_stock`.
- `shiftSlice`: `open_shift`, `close_shift`.
- `purchaseSlice`: PO create/approve/cancel RPCs and `receive_purchase_order`.
- `transferSlice`: transfer create/approve/reject/cancel RPCs and
  `complete_stock_transfer`.
- `auditSlice`: `log_receipt_reprint` and `log_audit_event`.

Admin/reference writes remain direct Supabase table writes with permission-aware
RLS:

- shops and users
- categories and products
- product barcode mappings
- suppliers
- price tiers

## RLS Architecture

RLS is active:

- Direct writes to protected operational tables are revoked.
- `SECURITY DEFINER` RPCs perform permission checks with:
  `current_app_user()`, `app_has_perm()`, and `app_can_for_shop()`.
- Operational SELECT policies are shop-scoped for non-admin users.
- `audit_logs` direct writes are blocked; audit rows are written by RPCs.

See [04-database-schema.md](./04-database-schema.md) and
[29-live-supabase-rls-rpc-verification.md](./29-live-supabase-rls-rpc-verification.md).

## Product Code Model

The product domain has both:

- `products.sku`: required catalog code edited in the product form.
- `product_barcodes`: optional scan-code mappings used by POS barcode lookup.

## Permission Source Of Truth

The central permission registry and route mapping live in
`src/lib/permissions.ts`.

## Error Handling

Friendly user-facing messages route through a single utility:

- `src/lib/errors.ts` — `getErrorMessage(err, fallback?)` and classifiers
  (`isPermissionError`, `isNetworkError`, `isDuplicateError`,
  `isStorageError`, `isExpiredSessionError`, `isInsufficientStockError`,
  `isNoOpenShiftError`). The mapper covers Postgres SQLSTATE codes
  (`42501`, `23505`, `PGRST301`), Supabase storage phrasing, JWT expiry,
  and common business-domain phrases.
- `src/lib/supabase.ts` — `dbWrite` toasts and `dbExec` throws use the
  mapper, so RLS / duplicate / network errors never leak raw Postgres
  text into the UI.
- `src/hooks/useAsyncAction.ts` — standardized save/submit pattern:
  loading state, double-submit guard, friendly toast on failure, returns
  `undefined` so callers naturally keep modals open. `runAsyncAction` is
  the non-React variant.
- `src/components/ui/ErrorBoundary.tsx` — top-level boundary wraps the
  router in `App.tsx`. Stack traces render only in dev.
- `loadData` in `stores/data/index.ts` checks each parallel query's
  `.error` and exposes `loadError` + `retryLoadData`. `AppLayout` renders
  a "Couldn't load your data" Retry surface instead of a stuck spinner.

Manual QA checklist: `docs/34-error-handling-qa-checklist.md`.

## Adding New Features

1. Add route and sidebar entries using granular permission strings from
   `src/lib/permissions.ts`.
2. If the feature writes protected operational state, add a transactional RPC
   and keep frontend state reconciliation after RPC success.
3. If the feature writes only admin/reference data, use existing direct-write
   patterns and RLS permissions.
4. Add docs and live verification steps for any new database policy or RPC.
