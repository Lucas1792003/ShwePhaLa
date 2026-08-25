-- ============================================================
-- Migration 050: Drop stale "authenticated_all" policies
--
-- Found during live production RLS/RPC verification (see
-- docs/09-roadmap-todo.md and docs/archive/29-live-supabase-rls-rpc-
-- verification.md's result log): 20 tables still carried a leftover
-- `authenticated_all` policy (`FOR ALL TO authenticated USING (true)`)
-- alongside the real permission/shop-scoped SELECT policy migrations
-- 010/015 added. Postgres ORs multiple PERMISSIVE policies for the same
-- command together, so `USING (true)` silently makes the properly-scoped
-- policy irrelevant for reads — confirmed live: a plain test CASHIER
-- (no purchase:view/supplier:debt_view) could read the full
-- supplier_payments table, and a test MANAGER could read another shop's
-- audit_logs and inventory_movements rows.
--
-- This is a READ-only gap. Direct WRITES to these tables were already
-- confirmed blocked separately (table-level REVOKE, independent of RLS)
-- — verified during the same testing pass.
--
-- This is the exact cleanup migration 010 already did correctly for a
-- few tables (e.g. `suppliers`: "DROP POLICY IF EXISTS "authenticated_all"
-- ON suppliers;") — that DROP is present in the migration 010 file, but
-- `suppliers` still had a live `authenticated_all` policy on this
-- project, meaning migration 010 was not fully/correctly applied here
-- (matches the migration 044 / suppliers.updated_at discrepancy found
-- while building migration 048 — this project has more than one
-- migration file whose live effect doesn't match its file history).
--
-- Every one of these tables already has its own correctly-scoped SELECT
-- policy (`<table>_sel`) from migration 010 or 015 — dropping
-- `authenticated_all` does not remove read access, it removes the
-- unconditional bypass sitting next to it. Verified against a rolled-
-- back production transaction before this file was written (see
-- conversation): a CASHIER's supplier_payments read went from full-table
-- visibility to 0 rows once these policies were dropped in the test
-- transaction, with the legitimate `<table>_sel` policies still intact
-- and behaving exactly as designed for every role tested.
--
-- Idempotent (IF EXISTS). Run AFTER 001-049.
-- ============================================================

DROP POLICY IF EXISTS "authenticated_all" ON audit_logs;
DROP POLICY IF EXISTS "authenticated_all" ON categories;
DROP POLICY IF EXISTS "authenticated_all" ON inventory;
DROP POLICY IF EXISTS "authenticated_all" ON inventory_movements;
DROP POLICY IF EXISTS "authenticated_all" ON price_tiers;
DROP POLICY IF EXISTS "authenticated_all" ON product_barcodes;
DROP POLICY IF EXISTS "authenticated_all" ON products;
DROP POLICY IF EXISTS "authenticated_all" ON purchase_order_items;
DROP POLICY IF EXISTS "authenticated_all" ON purchase_orders;
DROP POLICY IF EXISTS "authenticated_all" ON refund_void_requests;
DROP POLICY IF EXISTS "authenticated_all" ON reprint_logs;
DROP POLICY IF EXISTS "authenticated_all" ON sale_items;
DROP POLICY IF EXISTS "authenticated_all" ON sales;
DROP POLICY IF EXISTS "authenticated_all" ON shifts;
DROP POLICY IF EXISTS "authenticated_all" ON shops;
DROP POLICY IF EXISTS "authenticated_all" ON stock_transfer_items;
DROP POLICY IF EXISTS "authenticated_all" ON stock_transfers;
DROP POLICY IF EXISTS "authenticated_all" ON supplier_payments;
DROP POLICY IF EXISTS "authenticated_all" ON suppliers;
DROP POLICY IF EXISTS "authenticated_all" ON users;
