# Data Persistence

Business data is stored in **Supabase PostgreSQL**. Zustand is an in-memory UI
cache hydrated from Supabase; it is not the durable data store.

## Loading

- `loadData()` in `src/stores/data/index.ts` fetches Supabase tables after
  authentication.
- Row mappers convert database `snake_case` columns to TypeScript `camelCase`.
- `AppLayout` calls `loadData()` once after auth and gates the UI with
  `isLoaded`.

## Writing

The current write model is mixed by design:

- Critical operational writes use transactional `SECURITY DEFINER` RPCs.
- Admin/reference tables still use direct, permission-gated Supabase writes:
  `shops`, `users`, `categories`, `products`, `product_barcodes`,
  `price_tiers`, and `suppliers`.
- Protected operational/audit tables reject direct authenticated writes after
  migrations `010` through `013`.

Older docs that say all slices write optimistically through `dbWrite` are stale.
Some admin/reference writes still use `dbWrite`, but sale checkout, refund/void,
purchase receiving, transfer completion, inventory adjustment, shift lifecycle,
PO/transfer status changes, request creation, and reprint logging are RPC-based.

## Still In localStorage

Only lightweight client state remains in localStorage:

- `pos-app` - selected shop UI context (`appStore`)
- `pos-language` - language + Zawgyi/Unicode preference (`languageStore`)
- Supabase Auth session token, managed by the Supabase client

No sales, inventory, shifts, purchase orders, transfers, or audit records are
persisted in localStorage.

