# Shwe Phala POS Documentation

Shwe Phala POS is a multi-shop POS + inventory system. React 19 +
TypeScript + Vite on top of **Supabase Auth + PostgreSQL**. RLS is on;
critical operational writes go through `SECURITY DEFINER` RPCs;
business data lives in Supabase, not localStorage. Admin sign-in adds a
second factor (authenticator app or emailed code), the UI is fully
English/Myanmar, the business brand (name + logo) is admin-editable, and
the complete app supports System / Light / Dark themes. The current desktop
release is **v1.0.9**; it includes the sidebar footer fix from v1.0.8 and a
new installer-level Windows process cleanup for the recurring updater failure.
See document 10 for the remaining real-hardware verification item.

## Quick Start

```bash
npm install
npm run dev
```

`.env.local`:

```bash
VITE_SUPABASE_URL=<your-project-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Full setup, env, Supabase, and deployment notes:
[07-setup-deployment.md](./07-setup-deployment.md).

## Documentation Map

| # | Doc | Read this when |
| --- | --- | --- |
| 01 | [Overview](./01-overview.md) | New to the project. |
| 02 | [Architecture](./02-architecture.md) | Building / reviewing app code, stores, error handling, routing. |
| 03 | [Database & Security](./03-database-security.md) | Touching SQL, RPCs, RLS, migrations, audit. |
| 04 | [Features & Workflows](./04-features-workflows.md) | Working on POS, shifts, inventory, purchases, transfers, refunds, suppliers, catalog, pricing. |
| 05 | [Roles & Permissions](./05-roles-permissions.md) | Adding gates, debugging "why can't role X do Y". |
| 06 | [UI, Printing & Hardware](./06-ui-printing-hardware.md) | Responsive layout, receipt + label printing, scanners, image upload + storage. |
| 07 | [Setup & Deployment](./07-setup-deployment.md) | Onboarding a new env / Vercel deploy / Supabase setup. |
| 08 | [Testing & QA](./08-testing-qa.md) | Verifying a change end-to-end before shipping. |
| 09 | [Roadmap & TODO](./09-roadmap-todo.md) | Picking up open work; tracking what's still outstanding. |
| 10 | [Offline-First & Desktop — Known Issues & TODO](./10-offline-desktop-known-issues.md) | Touching the sync outbox, local cache, or the Electron wrapper; before trusting offline mode in production. |

## Code Layout (one-screen orientation)

- **`src/app/`** — layout, sidebar, routes, route guards.
- **`src/components/`** — reusable UI (`ui/`, `pos/`, `receipt/`,
  `sales/`, `shifts/`, `inventory/`, `products/`, `dashboard/`,
  `purchases/`, `suppliers/`, `barcodes/`).
- **`src/features/`** — domain helpers (e.g. `pos/barcodeLookup.ts`,
  `suppliers/debt.ts`, `suppliers/actions.ts`,
  `barcodes/labelTemplates.ts`).
- **`src/pages/`** — page compositions, incl. `SupplierDetailPage` at
  `/app/suppliers/:supplierId`.
- **`src/hooks/`** — `useAsyncAction`, `useViewportWidth`, …
- **`src/stores/`** — Zustand stores; domain slices in `stores/data/`.
- **`src/lib/`** — Supabase client (`supabase.ts`), permission registry
  (`permissions.ts`), central error utility (`errors.ts`), formatting
  helpers.
- **`src/i18n/`** — `translations.ts` (English / Myanmar) used by
  `useTranslation`.
- **`supabase/`** — `schema.sql`, ordered `migrations/`, and Edge
  Functions in `functions/` (`email-sales-report`, `rotate-audit-log`,
  `admin-2fa`).

## Where Did The Old Docs Go?

The previous root contained 37+ markdown files including per-migration
test scripts and several overlapping flow docs. They have been moved
unchanged into [`archive/`](./archive/). The compact `01`–`09` docs
above summarize them.

If you need to look up a specific historical detail — a migration test
script, the old phase checklists, the long changelog — see the index:
[`archive/ARCHIVE_MAP.md`](./archive/ARCHIVE_MAP.md).

## Contributing Notes

- Pages stay thin; reusable UI in `src/components`, domain logic in
  `src/features/<feature>/`.
- Use `import type` for type-only imports; avoid re-export shims.
- Permissions come from `src/lib/permissions.ts`; never role-check by
  hand.
- Critical operational writes must go through RPCs and reconcile local
  state only after RPC success.
- Friendly user errors route through `src/lib/errors.ts` —
  `getErrorMessage(err)`. Never put raw Postgres text in a toast.
- For protected operational changes, add the migration first, document
  it in [03-database-security.md](./03-database-security.md), and add /
  refresh the relevant verification section in
  [08-testing-qa.md](./08-testing-qa.md).
