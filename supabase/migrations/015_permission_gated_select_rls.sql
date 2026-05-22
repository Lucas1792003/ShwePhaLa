-- ============================================================
-- Migration 015: Permission-gated SELECT RLS
-- Phase 2 (migration 011) made operational reads SHOP-scoped. That
-- still let any same-shop user read sensitive rows (a cashier could
-- read every shop sale, all movement history, audit logs, ...) even
-- when the UI hid them.
--
-- This migration adds a PERMISSION condition to the sensitive
-- "<table>_sel" SELECT policies so shop scope is no longer the only
-- gate. It ONLY changes SELECT policies — write policies, REVOKEs and
-- the SECURITY DEFINER RPC architecture are untouched.
--
-- READ MODEL (per table, see each policy below)
--   ADMIN                  -> reads everything.
--   permission + shop      -> a holder of the table's view permission
--                             reads rows for their assigned shop.
--   own-scoped fallback    -> a cashier with only the narrow permission
--                             reads just their own rows (own sales /
--                             shifts / requests) so POS, the receipt
--                             page and the shift summary keep working.
--   child tables           -> readable iff the parent row is readable.
--
-- Run AFTER 001-014. Idempotent (DROP POLICY IF EXISTS + CREATE OR REPLACE).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Identity helper: the current app user's id.
--    Mirrors app_role() / app_shop_id() from migration 003.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_user_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM users
  WHERE auth_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION app_user_id() TO authenticated;

-- ============================================================
-- 1. SALES
--   ADMIN                      -> all sales.
--   sale:view + shop           -> the full sales history for the shop.
--   sales:view_own_shift       -> only sales the caller rang up, or sales
--                                 belonging to a shift the caller owns
--                                 (POS receipt + own-shift summary).
-- ============================================================
DROP POLICY IF EXISTS "sales_sel" ON sales;
CREATE POLICY "sales_sel" ON sales FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (app_has_perm('sale:view') AND shop_id = app_shop_id())
    OR (
      app_has_perm('sales:view_own_shift')
      AND (
        cashier_id = app_user_id()
        OR shift_id IN (SELECT s.id FROM shifts s WHERE s.cashier_id = app_user_id())
      )
    )
  );

-- sale_items: readable iff the parent sale is readable (inherits sales RLS).
DROP POLICY IF EXISTS "sale_items_sel" ON sale_items;
CREATE POLICY "sale_items_sel" ON sale_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id = sale_items.sale_id)
  );

-- ============================================================
-- 2. INVENTORY
--   inventory:view_stock     -> current on-hand for the assigned shop.
--   inventory:view_movements -> movement / ledger history for the shop.
--   A cashier has view_stock but NOT view_movements.
-- ============================================================
DROP POLICY IF EXISTS "inventory_sel" ON inventory;
CREATE POLICY "inventory_sel" ON inventory FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (app_has_perm('inventory:view_stock') AND shop_id = app_shop_id())
  );

DROP POLICY IF EXISTS "inventory_movements_sel" ON inventory_movements;
CREATE POLICY "inventory_movements_sel" ON inventory_movements FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (app_has_perm('inventory:view_movements') AND shop_id = app_shop_id())
  );

-- ============================================================
-- 3. SHIFTS
--   shift:manage_all / report:shop_sales -> all shifts for the shop.
--   shift:manage_own / report:own_shift  -> only the caller's own shifts.
-- ============================================================
DROP POLICY IF EXISTS "shifts_sel" ON shifts;
CREATE POLICY "shifts_sel" ON shifts FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (
      (app_has_perm('shift:manage_all') OR app_has_perm('report:shop_sales'))
      AND shop_id = app_shop_id()
    )
    OR (
      (app_has_perm('shift:manage_own') OR app_has_perm('report:own_shift'))
      AND cashier_id = app_user_id()
    )
  );

-- ============================================================
-- 4. PURCHASE ORDERS
--   purchase:view + shop -> POs for the assigned shop.
--   (A BUYER must have a shop_id assigned — see migration 014 notes
--    and the UsersPage validation — or app_shop_id() is null and they
--    see nothing.)
-- ============================================================
DROP POLICY IF EXISTS "purchase_orders_sel" ON purchase_orders;
CREATE POLICY "purchase_orders_sel" ON purchase_orders FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (app_has_perm('purchase:view') AND shop_id = app_shop_id())
  );

-- purchase_order_items: readable iff the parent PO is readable.
DROP POLICY IF EXISTS "purchase_order_items_sel" ON purchase_order_items;
CREATE POLICY "purchase_order_items_sel" ON purchase_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
       WHERE po.id = purchase_order_items.purchase_order_id
    )
  );

-- ============================================================
-- 5. STOCK TRANSFERS
--   transfer:view -> transfers where the caller's shop is source OR
--                    destination.
-- ============================================================
DROP POLICY IF EXISTS "stock_transfers_sel" ON stock_transfers;
CREATE POLICY "stock_transfers_sel" ON stock_transfers FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (
      app_has_perm('transfer:view')
      AND (from_shop_id = app_shop_id() OR to_shop_id = app_shop_id())
    )
  );

-- stock_transfer_items: readable iff the parent transfer is readable.
DROP POLICY IF EXISTS "stock_transfer_items_sel" ON stock_transfer_items;
CREATE POLICY "stock_transfer_items_sel" ON stock_transfer_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stock_transfers t
       WHERE t.id = stock_transfer_items.transfer_id
    )
  );

-- ============================================================
-- 6. REFUND / VOID REQUESTS
--   pos:refund / pos:void_sale (approvers) -> requests for the shop.
--   created_by                             -> the requester reads their
--                                             own requests (cashier).
-- ============================================================
DROP POLICY IF EXISTS "refund_void_requests_sel" ON refund_void_requests;
CREATE POLICY "refund_void_requests_sel" ON refund_void_requests FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (
      (app_has_perm('pos:refund') OR app_has_perm('pos:void_sale'))
      AND shop_id = app_shop_id()
    )
    OR created_by = app_user_id()
  );

-- ============================================================
-- 7. REPRINT LOGS
--   Readable iff the parent sale is readable, plus the caller always
--   sees reprints they performed themselves.
-- ============================================================
DROP POLICY IF EXISTS "reprint_logs_sel" ON reprint_logs;
CREATE POLICY "reprint_logs_sel" ON reprint_logs FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id = reprint_logs.sale_id)
    OR printed_by = app_user_id()
  );

-- ============================================================
-- 8. AUDIT LOGS
--   audit:view_global / ADMIN -> all audit rows.
--   audit:view_shop           -> audit rows for the assigned shop.
--   A cashier has neither and reads no audit logs.
-- ============================================================
DROP POLICY IF EXISTS "audit_logs_sel" ON audit_logs;
CREATE POLICY "audit_logs_sel" ON audit_logs FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR app_has_perm('audit:view_global')
    OR (app_has_perm('audit:view_shop') AND shop_id = app_shop_id())
  );

-- ============================================================
-- Reference / catalog tables (shops, users, categories, products,
-- product_barcodes, price_tiers, suppliers) remain globally readable
-- by design — the POS and shared UI need them. Their write policies
-- are unchanged. No table grant or RPC is modified by this migration.
-- ============================================================
