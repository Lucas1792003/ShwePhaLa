# 01 · Overview

Shwe Phala POS is a multi-shop point-of-sale and inventory system. It is a
React 19 + TypeScript + Vite frontend on top of **Supabase Auth + PostgreSQL**.
Business data lives in Supabase; localStorage holds only UI preferences and
the Supabase Auth session.

## Purpose

- Run a multi-shop retail business: ring up sales, manage shifts, transfer
  stock between shops, raise purchase orders, receive supplier deliveries,
  pay suppliers, and report on the result.
- Provide role-aware operations (ADMIN / MANAGER / CASHIER / BUYER) with
  shop-scoped access and an auditable history of every operational write.

## Core Modules

| Area | Highlights |
| --- | --- |
| POS | Sellable-unit selection, unit-linked barcode scan with SKU fallback, cart stock guards, tier pricing for the default unit, payment modal, atomic checkout via `complete_sale` RPC. |
| Shifts | Open/close with server-side expected cash, live breakdown, variance reason gate. |
| Inventory | One row per `(shop_id, product_id)`. Adjustments and damage via `adjust_stock` RPC. Movement ledger with before/after qty. |
| Purchases | Create / approve / receive / cancel POs. `receive_purchase_order` writes inventory, movements, audit, and PO status atomically. |
| Suppliers | Supplier list + full detail page (`/app/suppliers/:supplierId`) with Overview / Purchase Orders / Payments tabs. Debt starts only when a PO is RECEIVED; payments via `record_supplier_payment`. |
| Transfers | Inter-shop transfers via `complete_stock_transfer`. Source/destination ledger rows and audit row in one transaction. |
| Refund / Void | Cashier requests, manager approves via `approve_refund_request` / `approve_void_request`. Inventory restocked atomically. |
| Catalog | Products, categories (icon-based with safe delete), barcodes, pricing tiers, product images in Supabase Storage. |
| Reports | Dashboard, shop sales, profit (ADMIN by default), inventory health, supplier debt. |
| Audit | Every operational write inserts an `audit_logs` row through an RPC; direct authenticated writes to `audit_logs` are blocked. |

## Current Readiness

- ✅ Supabase Auth with `users.auth_id` identity link.
- ✅ Granular permission model with `granted_permissions` / `revoked_permissions`.
- ✅ All critical operational writes are `SECURITY DEFINER` RPCs.
- ✅ RLS enabled: write lockdown on operational tables; permission-gated reads.
- ✅ Product images compressed `<= 100 KB` and uploaded to the Supabase
  Storage bucket `product-images` (no base64 in the row).
- ✅ Supplier detail moved from drawer to full page with action workspace.
- ✅ POS barcode scan resolves unit-linked `product_barcodes.value` before
  `products.sku` fallback; package barcodes add the configured Product Unit
  and SKU fallback adds the default unit.
- ✅ Central error utility (`src/lib/errors.ts`) maps Postgres / network /
  storage / domain errors to friendly user-facing strings; bootstrap has a
  retry surface; top-level `ErrorBoundary` is in place.
- ⏳ Live RPC / RLS verification still required against the production project
  (checklist preserved in [`archive/29-live-supabase-rls-rpc-verification.md`](./archive/29-live-supabase-rls-rpc-verification.md)).

## High-Priority Next Steps

See [09-roadmap-todo.md](./09-roadmap-todo.md) for the full list. Current
priorities:

- Run the live Supabase RLS / RPC verification against the target project.
- Move `src/data/seedSupabase.ts` out of browser source.
- Add Playwright smoke tests for the critical workflows.
- Add Vite manualChunks / dynamic import for the main bundle (~1.3 MB).
- Orphan cleanup for `product-images` storage objects.

## Where To Read More

| Topic | Doc |
| --- | --- |
| Architecture, stores, RPC-first writes, error handling | [02-architecture.md](./02-architecture.md) |
| Tables, RPCs, RLS, migrations | [03-database-security.md](./03-database-security.md) |
| Per-feature workflows (POS, shifts, inventory, etc.) | [04-features-workflows.md](./04-features-workflows.md) |
| Roles and granular permissions | [05-roles-permissions.md](./05-roles-permissions.md) |
| Responsive layout, printing, barcodes, hardware | [06-ui-printing-hardware.md](./06-ui-printing-hardware.md) |
| Local setup, env vars, Supabase, Vercel | [07-setup-deployment.md](./07-setup-deployment.md) |
| Verification checklists and QA scenarios | [08-testing-qa.md](./08-testing-qa.md) |
| Outstanding work | [09-roadmap-todo.md](./09-roadmap-todo.md) |

Original long-form docs and per-migration test scripts live in
[`archive/`](./archive/) — see [`archive/ARCHIVE_MAP.md`](./archive/ARCHIVE_MAP.md).
