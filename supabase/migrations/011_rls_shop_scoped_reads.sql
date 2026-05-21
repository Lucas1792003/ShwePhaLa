-- ============================================================
-- Migration 011: RLS Phase 2 — shop-scoped SELECT policies
-- Phase 1 kept SELECT open to all authenticated users. This phase
-- makes reads of operational / financial tables shop-aware so a
-- MANAGER / CASHIER can only read their assigned shop's data.
-- Run AFTER 001-010. Idempotent (DROP POLICY IF EXISTS).
--
-- READ MODEL
--   ADMIN            -> reads everything (app_role() = 'ADMIN').
--   MANAGER/CASHIER  -> reads rows for app_shop_id() only.
--   BUYER            -> app_shop_id() is null -> sees no operational
--                       rows; the catalog (products/categories) stays
--                       globally readable.
--
-- This migration ONLY changes "<table>_sel" SELECT policies. The Phase 1
-- write policies and REVOKEs are left untouched. Child tables are scoped
-- through their parent (which is itself shop-scoped).
--
-- Tables intentionally left globally readable (reference data the POS and
-- shared UI need): shops, users, categories, products, product_barcodes,
-- price_tiers, suppliers.
-- ============================================================

-- ---- sales ----
DROP POLICY IF EXISTS "sales_sel" ON sales;
CREATE POLICY "sales_sel" ON sales FOR SELECT TO authenticated
  USING (app_role() = 'ADMIN' OR shop_id = app_shop_id());

-- ---- sale_items (scoped through the parent sale) ----
DROP POLICY IF EXISTS "sale_items_sel" ON sale_items;
CREATE POLICY "sale_items_sel" ON sale_items FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM sales s
       WHERE s.id = sale_items.sale_id AND s.shop_id = app_shop_id()
    )
  );

-- ---- inventory ----
DROP POLICY IF EXISTS "inventory_sel" ON inventory;
CREATE POLICY "inventory_sel" ON inventory FOR SELECT TO authenticated
  USING (app_role() = 'ADMIN' OR shop_id = app_shop_id());

-- ---- inventory_movements ----
DROP POLICY IF EXISTS "inventory_movements_sel" ON inventory_movements;
CREATE POLICY "inventory_movements_sel" ON inventory_movements FOR SELECT TO authenticated
  USING (app_role() = 'ADMIN' OR shop_id = app_shop_id());

-- ---- shifts ----
DROP POLICY IF EXISTS "shifts_sel" ON shifts;
CREATE POLICY "shifts_sel" ON shifts FOR SELECT TO authenticated
  USING (app_role() = 'ADMIN' OR shop_id = app_shop_id());

-- ---- purchase_orders ----
DROP POLICY IF EXISTS "purchase_orders_sel" ON purchase_orders;
CREATE POLICY "purchase_orders_sel" ON purchase_orders FOR SELECT TO authenticated
  USING (app_role() = 'ADMIN' OR shop_id = app_shop_id());

-- ---- purchase_order_items (scoped through the parent purchase order) ----
DROP POLICY IF EXISTS "purchase_order_items_sel" ON purchase_order_items;
CREATE POLICY "purchase_order_items_sel" ON purchase_order_items FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM purchase_orders po
       WHERE po.id = purchase_order_items.purchase_order_id
         AND po.shop_id = app_shop_id()
    )
  );

-- ---- stock_transfers (visible to source OR destination shop) ----
DROP POLICY IF EXISTS "stock_transfers_sel" ON stock_transfers;
CREATE POLICY "stock_transfers_sel" ON stock_transfers FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR from_shop_id = app_shop_id()
    OR to_shop_id = app_shop_id()
  );

-- ---- stock_transfer_items (scoped through the parent transfer) ----
DROP POLICY IF EXISTS "stock_transfer_items_sel" ON stock_transfer_items;
CREATE POLICY "stock_transfer_items_sel" ON stock_transfer_items FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM stock_transfers t
       WHERE t.id = stock_transfer_items.transfer_id
         AND (t.from_shop_id = app_shop_id() OR t.to_shop_id = app_shop_id())
    )
  );

-- ---- refund_void_requests ----
DROP POLICY IF EXISTS "refund_void_requests_sel" ON refund_void_requests;
CREATE POLICY "refund_void_requests_sel" ON refund_void_requests FOR SELECT TO authenticated
  USING (app_role() = 'ADMIN' OR shop_id = app_shop_id());

-- ---- reprint_logs (scoped through the parent sale) ----
DROP POLICY IF EXISTS "reprint_logs_sel" ON reprint_logs;
CREATE POLICY "reprint_logs_sel" ON reprint_logs FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM sales s
       WHERE s.id = reprint_logs.sale_id AND s.shop_id = app_shop_id()
    )
  );

-- ---- audit_logs (ADMIN all; shop users only their shop, and only with
--                 the audit:view_shop permission) ----
DROP POLICY IF EXISTS "audit_logs_sel" ON audit_logs;
CREATE POLICY "audit_logs_sel" ON audit_logs FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (shop_id = app_shop_id() AND app_has_perm('audit:view_shop'))
  );
