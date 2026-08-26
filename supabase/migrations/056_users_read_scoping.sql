-- ============================================================
-- Migration 056: Scope `users` table reads to same-shop + self
--
-- Flagged in docs/09-roadmap-todo.md as an open product question (not a
-- bug): migration 010's `users_sel USING (true)` makes every staff
-- member's role, shop, active flag, and permission overrides readable by
-- any authenticated user via a direct `supabase.from('users').select('*')`
-- call — e.g. a plain CASHIER with devtools can enumerate every other
-- shop's staff and their permission grants/revokes. Decision: this should
-- be scoped, not left global.
--
-- New rule: a user can read their own row, any row in their own shop, any
-- ADMIN row (there's normally exactly one, per migration 020's
-- `users_only_one_admin` constraint), or everything if they themselves
-- are ADMIN. The "always see ADMIN rows" clause isn't part of the
-- original ask but is required to avoid a real regression: ADMIN acts
-- across every shop (approves things, adjusts stock, etc.), and any UI
-- that resolves an actor id to a display name (audit log, "approved by",
-- shift records) would otherwise show a blank/unknown name whenever the
-- actor was the ADMIN and the viewer was a non-admin in a different shop.
--
-- Everything that already worked continues to: ADMIN's own Users
-- management page (needs `user:create`, which only ADMIN holds by
-- default) keeps full visibility; `replace_manager`'s local refresh
-- queries `shop_id = <the shop being changed>`, which is always the
-- caller's own shop or an admin's action, both still covered.
--
-- Run AFTER 001-055. Idempotent (DROP + CREATE POLICY).
-- ============================================================

DROP POLICY IF EXISTS "users_sel" ON users;

CREATE POLICY "users_sel" ON users FOR SELECT TO authenticated USING (
  app_role() = 'ADMIN'
  OR id = app_user_id()
  OR role = 'ADMIN'
  OR (app_shop_id() IS NOT NULL AND shop_id = app_shop_id())
);
