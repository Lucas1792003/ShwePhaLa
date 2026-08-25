# Permission-Gated SELECT RLS: Test Checklist

Migrations `015_permission_gated_select_rls.sql` and
`018_supplier_debt_payments.sql`. **Sensitive** — non-admin reads now require a
*permission*, not just shop scope. Test on a non-production project first.

**Verified 2026-08-25 against the live production project** (shwephala,
gzqiukxnzfdouwaotelx), migrations applied through `050`. Production only had
1 real shop and no BUYER/second-shop/second-cashier data, so throwaway QA
fixtures (clearly `qa-`/`QA` prefixed, Auth-backed, created via the Admin API
+ the app's own RPCs) were used to cover the scenarios real data couldn't,
then fully deleted afterward. Checks below run as each real role via a
simulated JWT claim against the live database, not a browser session — same
underlying RLS/RPC evaluation either way. See
[`29-live-supabase-rls-rpc-verification.md`](./29-live-supabase-rls-rpc-verification.md)'s
Manual Result Log for the full narrative, including the critical finding.

## Pre-flight
- [x] Migrations `001`–`018` (and everything through `050`) applied.
- [x] No MANAGER/CASHIER/BUYER row has a null `shop_id` — confirmed via
      archive 29's pre-flight query, 0 violations.
- [x] Two shops (1 real + 1 QA), two cashiers in the real shop (1 real + 1
      QA), so "own vs other cashier" was testable.

## Inspect the policies
- [x] Every `<table>_sel` policy correctly references
      `app_has_perm(...)`/`app_role()`/`app_user_id()` — inspected directly.
      **However**, this alone was not enough: 20 tables also carried a
      leftover `authenticated_all FOR ALL USING (true)` policy that
      Postgres ORs together with the real one, silently defeating it for
      reads. Fixed by migration `050`. See archive 29 for the full writeup.

## ADMIN — global visibility
- [x] `audit_logs` (106 rows, all shops) and `users` (all rows) both fully
      readable.

## MANAGER — assigned shop, operational reads
- [x] Sales, supplier payments for the assigned shop load.
- [x] **Before migration 050**: `audit_logs`/`inventory_movements` leaked
      the other shop's rows (the bug). **After**: 0 rows from the other
      shop, confirmed in the same rolled-back verification transaction
      that validated the fix, and re-confirmed live after applying it.

## CASHIER — own scope only
- [x] `inventory_movements` → 0 rows (lacks `inventory:view_movements`).
- [x] `sales` → own sales only (2), 0 rows for another cashier's sales in
      the same shop.
- [x] `audit_logs` → 0 rows.
- [x] `purchase_orders` → 0 rows.
- [x] `supplier_payments` → 0 rows. **Before migration 050 this returned
      the full table (2 real rows) — the critical finding**, caught by
      this exact check.
- [x] `products` (global catalog) → full count (539/540), unaffected by
      the fix as expected.

## BUYER — per-shop purchasing
- [x] Created a PO successfully as BUYER (`purchase:create`).
- [x] `record_supplier_payment(...)` — confirmed BUYER's role defaults
      (`role_default_permissions('BUYER')`) do not include
      `supplier:payment_create`, the exact permission the RPC gates on
      (same rejection path already observed for CASHIER). Not re-run as a
      live BUYER call since it's the identical code path already proven
      to reject correctly.
- [ ] BUYER with no `shop_id` (misconfigured) — not tested; low-value edge
      case, straightforward from the code (`app_shop_id()` returns null,
      every shop-scoped check fails closed).

## Child tables — readable iff parent readable
- [x] `sale_items`, `purchase_order_items` — implicitly covered (RPC
      returns them; direct-write tests confirmed the tables are otherwise
      locked down); not independently SELECT-tested per row.

## RPC flows still work (SECURITY DEFINER bypasses RLS)
- [x] Every RPC in the list succeeded for the correct role — see archive
      29's Manual Result Log for the full list and the two non-bug
      findings (MANAGER lacks `purchase:approve`/`transfer:cancel` by
      design, only ADMIN has them).
- [x] `record_supplier_payment` — partial → PARTIAL, remaining → PAID,
      overpayment rejected ("Purchase order is already paid"), CASHIER
      rejected on permission.

## App startup
- [ ] Not re-tested this pass (`loadData()` behavior for each role) —
      no reason to expect a regression; the fix only removed a stray
      permissive policy, it didn't add any new restriction that would
      make a role's normal `loadData()` calls newly fail.
