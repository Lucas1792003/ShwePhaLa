# Script 4B — RLS Phase 2 (Shop-Scoped Reads): Test Checklist

Migration `011_rls_shop_scoped_reads.sql`. **Sensitive** — non-admin reads are
now shop-scoped. Test on a non-production project first if possible.

## Pre-flight
- [ ] Migrations `001`–`010` are applied.
- [ ] Every MANAGER / CASHIER `users` row has a non-null `shop_id`
      (`SELECT id, role, shop_id FROM users WHERE role IN ('MANAGER','CASHIER') AND shop_id IS NULL;`
      → should be empty; a null shop means that user sees no operational data).
- [ ] At least two shops exist, each with its own sales / inventory / shifts,
      so cross-shop isolation can actually be observed.

## ADMIN — global visibility
- [ ] Log in as ADMIN → dashboard, sales, inventory, shifts, transfers,
      purchases, audit all load with data from **all** shops.
- [ ] The shop switcher changes the viewed shop; all shops' data is reachable.

## MANAGER — assigned shop only
- [ ] Log in as a MANAGER of Shop A → sales / inventory / movements / shifts /
      purchase orders / reports show **only Shop A**.
- [ ] No Shop B sales, inventory, shifts, POs, or audit rows appear anywhere.
- [ ] Console check: `await supabase.from('sales').select('*')` returns **only
      Shop A** rows.
- [ ] Audit log page shows only Shop A entries.

## CASHIER — assigned shop only
- [ ] Log in as a CASHIER of Shop A → POS loads products (global catalog) and
      Shop A inventory.
- [ ] Sales history shows only Shop A sales.
- [ ] Console: `supabase.from('inventory').select('*')` → only Shop A.

## BUYER
- [ ] Catalog still loads (products / categories are globally readable).
- [ ] Operational tables return nothing (a buyer has no shop / no operational
      permissions) — and no buyer UI depends on them.

## Transfers — source OR destination
- [ ] A transfer from Shop A → Shop B is visible to **both** a Shop A user
      (Outgoing) and a Shop B user (Incoming).
- [ ] A transfer between Shop A and Shop C is **not** visible to a Shop B user.

## Purchase orders
- [ ] A PO for Shop A is visible to Shop A users and ADMIN only.
- [ ] A Shop B user does not see Shop A's POs or their line items.

## No leaks
- [ ] Reports for a manager total only their shop (no other-shop revenue).
- [ ] `sale_items`, `purchase_order_items`, `stock_transfer_items`,
      `reprint_logs` are only visible when their parent row is visible.

## RPC flows still work
- [ ] POS checkout, refund/void approval, receiving, transfer completion,
      adjustment, open/close shift all still work (SECURITY DEFINER RPCs
      bypass RLS and are unaffected by read policies).

## Reference data still global
- [ ] All roles can read the shop list, product catalog, categories,
      suppliers, price tiers, and the user list (names still display).

## Rollback note
To revert a table to open reads:
`DROP POLICY IF EXISTS "<table>_sel" ON <table>;`
`CREATE POLICY "<table>_sel" ON <table> FOR SELECT TO authenticated USING (true);`

