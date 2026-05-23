# Script 4A — RLS Lockdown Phase 1: Test Checklist

Migration `010_rls_lockdown_phase_1.sql`. **High-risk** — RLS is now enforced.
Test on a non-production project first if possible.

## Pre-flight
- [ ] Migrations `001`–`009` have all been applied.
- [ ] Every `users` row has a non-null `auth_id`
      (`SELECT id, email, auth_id FROM users WHERE auth_id IS NULL;` → ideally
      empty; any rows here cannot write under RLS until linked).
- [ ] `app_has_perm` / `app_can_for_shop` / `current_app_user` exist (migration 003).

## Reads still work (loadData)
- [ ] Log in as ADMIN → the app loads (dashboard, products, sales, inventory…).
- [ ] Log in as MANAGER → the app loads.
- [ ] Log in as CASHIER → the app loads.
  (Phase 1 keeps SELECT open to all authenticated users — no read should break.)

## Protected tables — direct writes blocked
With the browser DevTools console, signed in as **any** user, each of these
must FAIL (RLS / privilege error):
- [ ] `supabase.from('sales').insert({...})`
- [ ] `supabase.from('sale_items').insert({...})`
- [ ] `supabase.from('inventory').update({...})`
- [ ] `supabase.from('inventory_movements').insert({...})`
- [ ] `supabase.from('shifts').insert({...})`

## RPC flows still work (SECURITY DEFINER bypasses RLS)
- [ ] POS checkout (`complete_sale`) completes a sale.
- [ ] Refund/void approval works.
- [ ] Purchase receiving works.
- [ ] Stock transfer completion works.
- [ ] Manual inventory adjustment works.
- [ ] Open shift / close shift works.

## Permission-aware direct writes (as ADMIN — should all succeed)
- [ ] Create / edit a shop.
- [ ] Create / edit a product; create / edit a category.
- [ ] Create / edit a supplier.
- [ ] Create / edit / delete a price tier.
- [ ] Create a purchase order; approve it; cancel a draft.
- [ ] Create a stock transfer; approve it; reject / cancel one.
- [ ] Request a void/refund from a receipt.
- [ ] Reprint a receipt (writes `reprint_logs`).

## Users table — self-escalation blocked
- [ ] ADMIN can create a staff account (the admin stays logged in as themselves
      afterwards — session is preserved across `signUp`).
- [ ] ADMIN can edit a user's role / shop.
- [ ] As a CASHIER, in the console:
      `supabase.from('users').update({ role: 'ADMIN' }).eq('id', '<own id>')`
      → **fails**.
- [ ] As a CASHIER: `supabase.from('users').insert({...})` → **fails**.
- [ ] First-ever login on an empty `users` table still creates the ADMIN.

## Audit logs
- [ ] `audit_logs` rows still appear for create/approve/cancel actions.
- [ ] As any user, `supabase.from('audit_logs').insert({ actor_id: '<someone else>' , ... })`
      → **fails** (can only insert as yourself).
- [ ] `supabase.from('audit_logs').update(...)` / `.delete(...)` → **fail**.

## Rollback note
If the app breaks, the lockdown can be reverted by recreating the broad
policy per table:
`CREATE POLICY "authenticated_all" ON <table> FOR ALL TO authenticated USING (true) WITH CHECK (true);`
and `GRANT INSERT, UPDATE, DELETE ON <table> TO authenticated;` for the
REVOKEd tables.

