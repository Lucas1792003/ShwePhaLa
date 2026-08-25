# Script 4D: Live Supabase RLS/RPC Verification

This checklist verifies the locked-down Supabase implementation against a real
database with real authenticated users and RLS enabled.

Run this after migrations `001` through `018` are applied.

## Required Test Accounts

Create or confirm these Supabase Auth users and matching `public.users` rows:

- `ADMIN`: active, `auth_id` set, global role.
- `MANAGER`: active, `auth_id` set, assigned `shop_id`.
- `CASHIER`: active, `auth_id` set, assigned to the same shop as the manager.
- Optional wrong-shop `CASHIER`: active, `auth_id` set, assigned to another shop.
- Optional `BUYER`: active, `auth_id` set, assigned `shop_id`.

## Pre-Flight SQL Checks

Run these in the Supabase SQL editor before manual RPC tests.

```sql
-- Staff identity mapping must be complete.
select id, email, role
from users
where is_active = true and auth_id is null;

-- Shop-bound staff must have a shop.
select id, email, role
from users
where is_active = true
  and role in ('MANAGER', 'CASHIER', 'BUYER')
  and shop_id is null;

-- Receipt numbers should be unique per shop.
select shop_id, receipt_no, count(*) as count
from sales
group by shop_id, receipt_no
having count(*) > 1;

-- Open shift uniqueness.
select cashier_id, shop_id, count(*) as open_count
from shifts
where ended_at is null
group by cashier_id, shop_id
having count(*) > 1;

-- Orphan ledger rows.
select m.*
from inventory_movements m
left join products p on p.id = m.product_id
left join shops s on s.id = m.shop_id
where p.id is null or s.id is null;

-- Orphan sale items.
select i.*
from sale_items i
left join sales s on s.id = i.sale_id
left join products p on p.id = i.product_id
where s.id is null or p.id is null;

-- Orphan purchase order items.
select i.*
from purchase_order_items i
left join purchase_orders po on po.id = i.purchase_order_id
left join products p on p.id = i.product_id
where po.id is null or p.id is null;

-- Orphan supplier payments.
select p.*
from supplier_payments p
left join suppliers s on s.id = p.supplier_id
left join purchase_orders po on po.id = p.purchase_order_id
left join shops sh on sh.id = p.shop_id
left join users u on u.id = p.created_by
where s.id is null or po.id is null or sh.id is null or u.id is null;

-- Orphan stock transfer items.
select i.*
from stock_transfer_items i
left join stock_transfers t on t.id = i.transfer_id
left join products p on p.id = i.product_id
where t.id is null or p.id is null;

-- Duplicate pending refund/void requests for the same sale/type.
select sale_id, type, count(*) as pending_count
from refund_void_requests
where status = 'REQUESTED'
group by sale_id, type
having count(*) > 1;

-- Optional ledger smoke check: compare current inventory to movement deltas
-- only if the first movement per product/shop starts from zero.
with movement_balance as (
  select shop_id, product_id, sum(qty_change) as ledger_qty
  from inventory_movements
  group by shop_id, product_id
)
select i.shop_id, i.product_id, i.qty_base_units, mb.ledger_qty
from inventory i
join movement_balance mb
  on mb.shop_id = i.shop_id and mb.product_id = i.product_id
where i.qty_base_units <> mb.ledger_qty;
```

The optional ledger check can produce false positives if the database was
bootstrapped with initial inventory rows without matching opening movements.

## Authentication / Identity Tests

In the app:

1. Log in as `ADMIN`.
2. Confirm the app loads and `current_app_user()` resolves by running:

```sql
select auth.uid(), (current_app_user()).id, app_role(), app_shop_id();
```

Repeat for `MANAGER` and `CASHIER`.

Expected:

- `auth.uid()` is not null.
- `(current_app_user()).id` is not null.
- `MANAGER` and `CASHIER` return their assigned `app_shop_id()`.
- No active staff user has null `auth_id`.

## RPC Success Tests

Run these through the app UI where possible. For SQL editor RPC calls that need
RLS/auth context, use a non-service authenticated client such as the app, a
small Supabase JS script with user email/password, or Supabase REST with the
user access token.

### Shift and POS

1. Log in as valid `CASHIER`.
2. Open a shift.
   - Expected: `open_shift` succeeds and inserts one shift.
3. Complete a normal sale.
   - Expected: `complete_sale` succeeds, sale/items/movements/audit rows appear.
4. Try the same sale from wrong-shop cashier.
   - Expected: RPC rejects shop access.
5. Try sale quantity above stock without stock override.
   - Expected: RPC rejects insufficient stock.
6. Grant stock override permission to a test user and retry.
   - Expected: sale succeeds and stock override audit row is created.
7. Close the shift.
   - Expected: `close_shift` succeeds and expected cash is computed server-side.

### Inventory Adjustment

1. Log in as authorized manager/admin.
2. Run stock adjustment from Inventory page.
   - Expected: `adjust_stock` succeeds and movement/audit rows appear.
3. Log in as cashier without adjustment permission and retry.
   - Expected: RPC rejects permission.

### Refund / Void

1. Create refund request for a valid sale.
   - Expected: `create_refund_void_request` succeeds and audit row appears.
2. Create void request for a normal sale.
   - Expected: request row appears with status `REQUESTED`.
3. Approve refund/void as authorized manager/admin.
   - Expected: `approve_refund_request` / `approve_void_request` succeeds.
4. Retry approving the same request.
   - Expected: RPC rejects non-pending request.

### Purchasing

1. Create purchase order.
   - Expected: `create_purchase_order` succeeds, items and audit row appear.
2. Approve purchase order.
   - Expected: `approve_purchase_order` changes status to `APPROVED`.
3. Receive purchase order.
   - Expected: `receive_purchase_order` updates received qty, stock, movement,
     audit, `received_by`, and `received_at`.
   - Expected: payment status remains `UNPAID` and `paid_mmk` remains `0`
     unless a future prepayment flow explicitly changes that rule.
4. Cancel a draft/submitted PO.
   - Expected: `cancel_purchase_order` succeeds only for cancelable status.

### Supplier Payments

1. Open a received supplier PO with a positive balance.
   - Expected: supplier detail shows received confirmation, outstanding balance,
     and `Record payment` for authorized ADMIN/MANAGER users.
2. Record a partial payment.
   - Expected: `record_supplier_payment` inserts a payment row, updates
     `paid_mmk`, changes payment status to `PARTIAL`, and writes an audit row.
3. Record the remaining balance.
   - Expected: payment status changes to `PAID` and outstanding balance becomes
     zero.
4. Try an overpayment.
   - Expected: RPC rejects the payment and leaves PO/payment rows unchanged.
5. Try payment against an unreceived or canceled PO.
   - Expected: RPC rejects the payment.
6. Try payment as a wrong-shop manager, buyer without explicit payment
   permission, and cashier.
   - Expected: RPC rejects permission or shop access.

### Transfers

1. Create stock transfer.
   - Expected: `create_stock_transfer` succeeds and validates source stock.
2. Approve transfer.
   - Expected: `approve_stock_transfer` sets status `APPROVED` and approved qty.
3. Complete transfer.
   - Expected: `complete_stock_transfer` moves stock out/in with paired movements.
4. Create another transfer and reject it.
   - Expected: `reject_stock_transfer` sets status `REJECTED`.
5. Create another transfer and cancel it.
   - Expected: `cancel_stock_transfer` sets status `CANCELED`.

### Receipt Reprint

1. Reprint a valid sale receipt.
   - Expected: `log_receipt_reprint` inserts `reprint_logs` and audit row.

## Protected Direct Write Failure Tests

Use an authenticated non-service-role Supabase client. These direct writes must
fail after migration `018`.

```ts
await supabase.from("sales").insert({ ... });
await supabase.from("sale_items").insert({ ... });
await supabase.from("inventory").update({ qty_base_units: 999 }).eq("shop_id", shopId);
await supabase.from("inventory_movements").insert({ ... });
await supabase.from("shifts").insert({ ... });
await supabase.from("audit_logs").insert({ ... });
await supabase.from("purchase_orders").update({ status: "APPROVED" }).eq("id", poId);
await supabase.from("supplier_payments").insert({ ... });
await supabase.from("stock_transfers").update({ status: "APPROVED" }).eq("id", transferId);
await supabase.from("refund_void_requests").update({ status: "APPROVED" }).eq("id", requestId);
await supabase.from("reprint_logs").insert({ ... });
```

Expected result for each: permission/RLS error and no row changes.

## Shop-Scoped Read Tests

Log in as each role and reload the app.

- `ADMIN`: can see all shops' operational data.
- `MANAGER`: can see only assigned-shop sales, shifts, inventory, purchases,
  supplier payments, refund/void requests, and movements.
- `CASHIER`: can see only assigned-shop POS operational data and should not see
  supplier debt or supplier payment records.
- `BUYER`: can read assigned-shop supplier purchase records and payment records
  when supplier debt or purchase-view permission allows it, but cannot record
  supplier payments by default.
- Transfers: visible only to source-shop users, destination-shop users, and
  `ADMIN`.
- Audit logs: `ADMIN` can see all; shop users can see only their shop logs when
  they have `audit:view_shop`.

## Protected Write Grep / Classification

Command:

```bash
rg '\\.(insert|update|delete|upsert)\\(' -n src
```

Allowed runtime direct writes:

- Admin/reference writes:
  - `shops`
  - `users`
  - `categories`
  - `products`
  - `product_barcodes`
  - `price_tiers`
  - `suppliers`

RPC-only operational writes:

- `sales`
- `sale_items`
- `inventory`
- `inventory_movements`
- `shifts`
- `audit_logs`
- `purchase_orders`
- `purchase_order_items`
- `supplier_payments`
- `stock_transfers`
- `stock_transfer_items`
- `refund_void_requests`
- `reprint_logs`

Current expected exception:

- `scripts/seed/seedBrowser.ts` contains direct seed writes for development
  reference only. It is guarded and must not be run from the browser after RLS
  lockdown. Use SQL editor, `supabase db reset`, or
  `scripts/seed/seedServiceRole.ts` (`npm run seed:service-role`) for full
  seed data.

There should be no runtime direct writes to protected operational/audit tables.

## Seed / Admin Tooling Rule

Do not seed protected tables from the app Supabase client.

Use one of:

- SQL seed files run by Supabase CLI.
- SQL editor with an owner/service context.
- A private server-side script using service-role credentials.

Never expose service-role keys to Vite/browser code.

## Manual Result Log

- Date: 2026-08-25
- Supabase project: shwephala (gzqiukxnzfdouwaotelx)
- Migrations applied through: 050
- Method: production had only 1 real shop / 3 real staff (no BUYER, no
  second shop, no second cashier), not enough to exercise cross-shop or
  own-vs-other-cashier scoping — created throwaway QA fixtures (1 shop, 4
  Auth-backed users, 1 product, 1 supplier, clearly `qa-`/`QA` prefixed)
  via the Supabase Admin API + the app's own RPCs, ran every check as the
  real role via a simulated JWT claim (`SET LOCAL "request.jwt.claim.sub"`)
  against the real production database, then deleted every QA row and
  Auth account afterward. Pre-flight SQL checks: all clean, 0 violations.
- Admin identity check: pass — `auth.uid()`, `current_app_user()`,
  `app_role()`, `app_shop_id()` all resolve correctly.
- Manager identity check: pass, for both the real MANAGER and a QA
  MANAGER in a second shop.
- Cashier identity check: pass, for the real CASHIER and 2 QA cashiers
  (same-shop and different-shop).
- RPC success tests: all pass — shift open/close, `complete_sale`
  (normal + oversell correctly rejected without `pos:override_stock`,
  correctly allowed with it and `stock_override_by` correctly stamped),
  `adjust_stock`, refund/void request + approval + reject-on-retry,
  purchase order create/approve/receive (payment status stays UNPAID,
  `paid_mmk` 0, as expected), supplier payment partial/final/overpayment-
  rejected, stock transfer create/approve/dispatch/receive/reject/cancel,
  receipt reprint.
  **Finding (not a bug, confirm intentional):** MANAGER has
  `purchase:create`/`purchase:receive` but not `purchase:approve`, and
  `transfer:create`/`transfer:approve` but not `transfer:cancel` — only
  ADMIN holds those by default (`014_rbac_role_tuning.sql`). This makes
  the single ADMIN account a hard bottleneck for approving every PO and
  canceling every transfer. Confirmed as designed intent, not verified as
  a mistake — flagging since it wasn't obviously intentional going in.
- Protected direct write failures: pass — all 11 listed tables (`sales`,
  `inventory`, `inventory_movements`, `shifts`, `audit_logs`,
  `purchase_orders`, `supplier_payments`, `stock_transfers`,
  `refund_void_requests`, `reprint_logs`) reject a direct write from an
  ordinary authenticated (non-service) session with `permission denied`
  — the table-level GRANT itself is revoked, not just RLS, so this holds
  regardless of any RLS policy state.
- Shop-scoped reads: **initially failed** — see the critical finding
  below. Re-verified and passing after migration `050`.
- Notes / defects:
  - **[Fixed, migration 050, applied 2026-08-25] Critical: read-scoping
    was silently defeated on 20 tables.** `sales`, `shifts`,
    `purchase_orders`, `supplier_payments`, `audit_logs`,
    `inventory_movements`, `users`, `suppliers`, `stock_transfers`,
    `refund_void_requests`, `reprint_logs`, `sale_items`,
    `stock_transfer_items`, `purchase_order_items`, `categories`,
    `products`, `inventory`, `price_tiers`, `product_barcodes`, `shops`
    each still had a leftover `authenticated_all FOR ALL TO authenticated
    USING (true)` policy sitting *alongside* the real permission/shop-
    scoped `<table>_sel` policy from migrations 010/015. Postgres ORs
    multiple PERMISSIVE policies together, so the unconditional `true`
    policy silently overrode the real one for every read. Confirmed live,
    not theoretical: a plain QA test CASHIER with no `purchase:view` or
    `supplier:debt_view` could read the full `supplier_payments` table
    (real supplier debt/payment amounts), and a QA test MANAGER could
    read another shop's `audit_logs` and `inventory_movements` rows.
    Writes were unaffected (separately confirmed blocked by table-level
    REVOKE). Root cause: migration `010` already contains the correct
    `DROP POLICY IF EXISTS "authenticated_all"` cleanup for a few tables
    (e.g. `suppliers`) — those tables *still* had a live `authenticated_all`
    policy on this project, meaning migration `010` was not fully/
    correctly applied here originally (same class of gap as the
    `suppliers.updated_at` / migration `044` discrepancy found while
    building migration `048` — this project has more than one migration
    file whose live database state doesn't match its file history).
    Migration `050` drops the stale policy on all 20 tables; verified
    against a rolled-back transaction before applying (CASHIER's
    `supplier_payments` read went from full-table to 0 rows, MANAGER's
    cross-shop `audit_logs` read went from leaking to 0 rows, ADMIN/
    MANAGER/CASHIER legitimate access all unchanged) and re-confirmed
    live after applying.
  - No other defects found. Every other RPC/permission check in this
    document passed correctly once written right (two of my own test
    scripts had bugs, not the app — a wrong JSON key path when reading an
    RPC's return value, and a stale sale id from an earlier step; both
    caught by cross-checking the underlying table directly).


