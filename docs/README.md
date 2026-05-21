# Shwe Phala POS Documentation

Shwe Phala POS is a React/TypeScript POS and inventory app backed by Supabase
Auth and PostgreSQL.

## Run Locally

```bash
npm install
npm run dev
```

Requires `.env.local`:

```bash
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

See [12-supabase-setup.md](./12-supabase-setup.md).

## Current Data Model

- Business data persists in Supabase.
- localStorage stores UI preferences and the Supabase Auth session only.
- Critical operational writes use `SECURITY DEFINER` RPCs.
- RLS blocks direct writes to protected operational/audit tables.
- `inventory` is the current stock table.
- `refund_void_requests` is the refund/void workflow table.
- Products use `sku` as the catalog code; `product_barcodes` still exists for
  optional scan-code lookup.

## Core Docs

- [00-overview.md](./00-overview.md) - Product overview
- [01-roles-permissions.md](./01-roles-permissions.md) - Granular permissions
- [02-routing-navigation.md](./02-routing-navigation.md) - Routes and route permissions
- [03-authentication.md](./03-authentication.md) - Supabase Auth and `users.auth_id`
- [04-database-schema.md](./04-database-schema.md) - Tables, migrations, RPCs, RLS status
- [10-localstorage-persistence.md](./10-localstorage-persistence.md) - Persistence model
- [12-supabase-setup.md](./12-supabase-setup.md) - Supabase setup
- [13-data-model.md](./13-data-model.md) - TypeScript domain model
- [17-architecture.md](./17-architecture.md) - App architecture after RPC/RLS hardening

## Flow Docs

- [05-pos-flow.md](./05-pos-flow.md)
- [06-inventory-flow.md](./06-inventory-flow.md)
- [07-shift-flow.md](./07-shift-flow.md)
- [08-refund-void-flow.md](./08-refund-void-flow.md)
- [09-audit-logging.md](./09-audit-logging.md)
- [14-stock-transfers.md](./14-stock-transfers.md)
- [15-suppliers-purchasing.md](./15-suppliers-purchasing.md)
- [16-pricing-tiers.md](./16-pricing-tiers.md)
- [18-printing.md](./18-printing.md)

## Verification Docs

- [22-script-3a-checkout-rpc-tests.md](./22-script-3a-checkout-rpc-tests.md)
- [23-script-3b-refund-void-rpc-tests.md](./23-script-3b-refund-void-rpc-tests.md)
- [24-script-3c-receive-purchase-order-rpc-tests.md](./24-script-3c-receive-purchase-order-rpc-tests.md)
- [24-script-3f-shift-rpc-tests.md](./24-script-3f-shift-rpc-tests.md)
- [25-script-3d-complete-stock-transfer-rpc-tests.md](./25-script-3d-complete-stock-transfer-rpc-tests.md)
- [26-script-3e-adjust-stock-rpc-tests.md](./26-script-3e-adjust-stock-rpc-tests.md)
- [27-script-4a-rls-lockdown-tests.md](./27-script-4a-rls-lockdown-tests.md)
- [28-script-4b-shop-scoped-reads-tests.md](./28-script-4b-shop-scoped-reads-tests.md)
- [29-live-supabase-rls-rpc-verification.md](./29-live-supabase-rls-rpc-verification.md)

## Status

- [20-todo-next.md](./20-todo-next.md) - Current project status and next steps
- [21-recent-changes.md](./21-recent-changes.md) - Changelog
- [19-contributing.md](./19-contributing.md) - Contribution notes

