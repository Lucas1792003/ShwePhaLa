# Supabase Setup

Shwe Phala POS currently runs on **Supabase Auth + PostgreSQL**. This is not a
future plan; it is the active backend.

## Environment Variables

Set these in `.env.local`:

```bash
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Do not put a service-role key in Vite/browser environment variables.

## Database Setup

For a new local Supabase database:

1. Apply `supabase/schema.sql`.
2. Apply every migration in `supabase/migrations/` in numeric order.
3. Create Supabase Auth users for staff.
4. Ensure `public.users.auth_id` links each active staff profile to the matching
   Auth user.

For an existing database, apply only new migrations in order.

## Current Persistence Model

- Business data is persisted in Supabase PostgreSQL.
- `dataStore.loadData()` hydrates Zustand from Supabase after login.
- Critical operational writes use `SECURITY DEFINER` RPCs.
- Remaining direct writes are limited to permission-gated admin/reference tables.
- localStorage stores only UI preferences and the Supabase Auth session managed
  by the Supabase client.

See [10-localstorage-persistence.md](./10-localstorage-persistence.md).

## RLS / RPC Model

RLS is enabled and locked down for operational writes:

- POS checkout: `complete_sale`
- Refund/void approval: `approve_refund_request`, `approve_void_request`
- Purchase receiving: `receive_purchase_order`
- Transfer completion: `complete_stock_transfer`
- Manual stock adjustment/damage: `adjust_stock`
- Shift open/close: `open_shift`, `close_shift`
- PO/transfer/request/reprint status flows: migration `012` RPCs
- Direct audit writes: revoked by migration `013`

Operational reads are shop-scoped by migration `011`.

## Seed Data

Do not seed protected tables from the browser/authenticated Supabase client
after RLS lockdown.

Use one of:

- Supabase SQL editor
- `supabase db reset` with SQL seed files
- a private server-side service-role script

`src/data/seedSupabase.ts` is retained only as a guarded development reference
and refuses to run unless `VITE_ALLOW_BROWSER_SUPABASE_SEED=true` in local
development.

## Verification

Use [29-live-supabase-rls-rpc-verification.md](./29-live-supabase-rls-rpc-verification.md)
to verify identity mapping, RPC success paths, direct-write failures, and
shop-scoped reads against a live project.

