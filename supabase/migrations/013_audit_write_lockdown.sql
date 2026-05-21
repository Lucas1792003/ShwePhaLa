-- ============================================================
-- Migration 013: Audit + operational status write lockdown
-- Run AFTER 012_operational_status_rpcs.sql.
--
-- Script 4C moves purchase order status changes, transfer status
-- changes, refund/void request creation, and receipt reprint logging
-- into SECURITY DEFINER RPCs. This migration removes the direct client
-- write path for those tables while preserving the Phase 2 SELECT
-- policies.
--
-- Reference/admin tables (shops, users, products, categories,
-- suppliers, price_tiers, product_barcodes) are intentionally not
-- changed here.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop direct write policies that existed only for pre-RPC flows.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "purchase_orders_ins" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_upd" ON purchase_orders;

DROP POLICY IF EXISTS "purchase_order_items_ins" ON purchase_order_items;

DROP POLICY IF EXISTS "stock_transfers_ins" ON stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_upd" ON stock_transfers;

DROP POLICY IF EXISTS "stock_transfer_items_ins" ON stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_upd" ON stock_transfer_items;

DROP POLICY IF EXISTS "refund_void_requests_ins" ON refund_void_requests;

DROP POLICY IF EXISTS "reprint_logs_ins" ON reprint_logs;

DROP POLICY IF EXISTS "audit_logs_ins" ON audit_logs;

-- ------------------------------------------------------------
-- 2. Revoke client write privileges on RPC-only operational tables.
--    SECURITY DEFINER RPCs continue to write as their owner.
-- ------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON purchase_orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON purchase_order_items FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON stock_transfers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON stock_transfer_items FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON refund_void_requests FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON reprint_logs FROM authenticated;

-- ------------------------------------------------------------
-- 3. Keep SELECT policies in place. Recreate only if a prior migration
--    was skipped and the policy is absent.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "audit_logs_sel" ON audit_logs;
CREATE POLICY "audit_logs_sel" ON audit_logs FOR SELECT TO authenticated
  USING (
    app_role() = 'ADMIN'
    OR (shop_id = app_shop_id() AND app_has_perm('audit:view_shop'))
  );

