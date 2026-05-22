# Migration 015 — Permission-Gated SELECT RLS: Test Checklist

Migration `015_permission_gated_select_rls.sql`. **Sensitive** — non-admin
reads now require a *permission*, not just shop scope. Test on a non-production
project first.

## Pre-flight
- [ ] Migrations `001`–`014` are applied; then apply `015`.
- [ ] Every MANAGER / CASHIER / BUYER `users` row has a non-null `shop_id`:
      `SELECT id, role, shop_id FROM users WHERE role <> 'ADMIN' AND shop_id IS NULL;`
      → should be empty.
- [ ] At least two shops, each with its own sales / inventory / shifts, and
      at least two cashiers in one shop so "own vs other cashier" is testable.

## Inspect the policies
```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public' AND policyname LIKE '%_sel'
ORDER BY tablename;
```
- [ ] Every sensitive `<table>_sel` policy references `app_has_perm(...)`,
      `app_role()`, `app_user_id()` or an `EXISTS` on its parent — not a bare
      `shop_id = app_shop_id()`.

## ADMIN — global visibility
- [ ] Logs in → dashboard, sales, inventory, movements, shifts, transfers,
      purchases, audit all load with data from **all** shops.
- [ ] `await supabase.from('audit_logs').select('*')` returns all shops' rows.

## MANAGER — assigned shop, operational reads
- [ ] Sales, inventory, **movement history**, shifts, POs, transfers, audit for
      the assigned shop all load.
- [ ] `supabase.from('inventory_movements').select('*')` returns Shop A rows
      (manager has `inventory:view_movements`).
- [ ] No Shop B rows appear anywhere.

## CASHIER — own scope only
- [ ] POS loads products (global catalog) and Shop A **stock**
      (`supabase.from('inventory').select('*')` → Shop A rows).
- [ ] `supabase.from('inventory_movements').select('*')` returns **0 rows**
      (cashier lacks `inventory:view_movements`).
- [ ] `supabase.from('sales').select('*')` returns **only the cashier's own
      sales** — not sales rung up by another cashier in the same shop.
- [ ] `supabase.from('shifts').select('*')` returns **only the cashier's own
      shifts**.
- [ ] `supabase.from('audit_logs').select('*')` returns **0 rows**.
- [ ] `supabase.from('purchase_orders').select('*')` returns **0 rows**.
- [ ] After a POS checkout the receipt page shows the just-created sale, its
      items and reprint log (own sale → readable).
- [ ] The shift summary on the Shift page shows correct totals for the open
      shift (own-shift sales are readable).
- [ ] A refund/void request the cashier raised is readable back
      (`created_by` self); other cashiers' requests are not.

## BUYER — per-shop purchasing
- [ ] With a `shop_id` assigned: `supabase.from('purchase_orders').select('*')`
      returns the assigned shop's POs; the buyer can create a PO.
- [ ] Catalog (`products`, `suppliers`) still loads (globally readable).
- [ ] A BUYER with **no `shop_id`** (legacy/misconfigured) sees no POs and can
      create none — treated as misconfigured; fix via the Users page.

## Child tables — readable iff parent readable
- [ ] `sale_items` rows appear only for sales the user can read.
- [ ] `purchase_order_items` only for visible POs.
- [ ] `stock_transfer_items` only for visible transfers.
- [ ] `reprint_logs` only for visible sales (plus the user's own reprints).

## RPC flows still work (SECURITY DEFINER bypasses RLS)
- [ ] POS checkout, refund/void request + approval, receipt reprint, stock
      adjustment, PO create/approve/receive, transfer create/approve/complete,
      open/close shift all still succeed for the appropriate roles.

## App startup
- [ ] `loadData()` completes without console errors for ADMIN / MANAGER /
      CASHIER / BUYER (tables the role cannot read simply return `[]`).
