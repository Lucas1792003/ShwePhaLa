-- ============================================================
-- Migration 010: RLS Lockdown — Phase 1
-- Replaces the broad `authenticated_all` (USING true) policies with
-- permission-aware policies, and revokes direct writes on the tables
-- that are now written only through SECURITY DEFINER RPCs.
-- Run AFTER 001-009. Idempotent (DROP POLICY IF EXISTS + REVOKE).
--
-- TABLE CLASSIFICATION
--   RPC-protected (writes locked, REVOKEd):
--     sales, sale_items, inventory, inventory_movements, shifts
--   Reference / admin (permission-aware writes):
--     shops, users, categories, products, product_barcodes,
--     price_tiers, suppliers
--   Shop-scoped operational (permission-aware writes — still direct):
--     purchase_orders, purchase_order_items, stock_transfers,
--     stock_transfer_items, refund_void_requests, reprint_logs
--   Audit/ledger:
--     audit_logs (insert-as-self only; no update/delete)
--
-- PHASE 1 SCOPE
--   * Writes: locked / permission-gated as above.
--   * Reads (SELECT): kept open to all authenticated users so loadData()
--     keeps working unchanged. Shop-scoped SELECT is deferred to Phase 2
--     (it requires a coordinated loadData() review).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Re-run the auth_id email backfill (idempotent).
--    RLS relies on users.auth_id; catch any users created since 001.
-- ------------------------------------------------------------
UPDATE users u
SET auth_id = au.id
FROM auth.users au
WHERE u.auth_id IS NULL
  AND u.email IS NOT NULL
  AND lower(u.email) = lower(au.email)
  AND (SELECT count(*) FROM users u2      WHERE lower(u2.email) = lower(u.email)) = 1
  AND (SELECT count(*) FROM auth.users a2 WHERE lower(a2.email) = lower(u.email)) = 1;

-- ============================================================
-- 1. RPC-PROTECTED TABLES — read-only for clients; writes via RPC only.
-- ============================================================

-- sales
DROP POLICY IF EXISTS "authenticated_all" ON sales;
DROP POLICY IF EXISTS "sales_sel" ON sales;
CREATE POLICY "sales_sel" ON sales FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON sales FROM authenticated;

-- sale_items
DROP POLICY IF EXISTS "authenticated_all" ON sale_items;
DROP POLICY IF EXISTS "sale_items_sel" ON sale_items;
CREATE POLICY "sale_items_sel" ON sale_items FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON sale_items FROM authenticated;

-- inventory
DROP POLICY IF EXISTS "authenticated_all" ON inventory;
DROP POLICY IF EXISTS "inventory_sel" ON inventory;
CREATE POLICY "inventory_sel" ON inventory FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON inventory FROM authenticated;

-- inventory_movements (immutable ledger)
DROP POLICY IF EXISTS "authenticated_all" ON inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_sel" ON inventory_movements;
CREATE POLICY "inventory_movements_sel" ON inventory_movements FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON inventory_movements FROM authenticated;

-- shifts
DROP POLICY IF EXISTS "authenticated_all" ON shifts;
DROP POLICY IF EXISTS "shifts_sel" ON shifts;
CREATE POLICY "shifts_sel" ON shifts FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON shifts FROM authenticated;

-- ============================================================
-- 2. REFERENCE / ADMIN TABLES — permission-aware writes.
-- ============================================================

-- shops
DROP POLICY IF EXISTS "authenticated_all" ON shops;
DROP POLICY IF EXISTS "shops_sel" ON shops;
DROP POLICY IF EXISTS "shops_ins" ON shops;
DROP POLICY IF EXISTS "shops_upd" ON shops;
CREATE POLICY "shops_sel" ON shops FOR SELECT TO authenticated USING (true);
CREATE POLICY "shops_ins" ON shops FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('shop:create'));
CREATE POLICY "shops_upd" ON shops FOR UPDATE TO authenticated
  USING (app_has_perm('shop:update')) WITH CHECK (app_has_perm('shop:update'));

-- users  (self-escalation protection — see migration header)
--   INSERT: needs user:create, OR the very first user (bootstrap).
--   UPDATE: admins only — non-admins cannot touch any users row,
--           so they cannot change their own role / permissions / shop.
DROP POLICY IF EXISTS "authenticated_all" ON users;
DROP POLICY IF EXISTS "users_sel" ON users;
DROP POLICY IF EXISTS "users_ins" ON users;
DROP POLICY IF EXISTS "users_upd" ON users;
CREATE POLICY "users_sel" ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_ins" ON users FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('user:create') OR NOT EXISTS (SELECT 1 FROM users));
CREATE POLICY "users_upd" ON users FOR UPDATE TO authenticated
  USING (app_has_perm('user:update')) WITH CHECK (app_has_perm('user:update'));

-- categories
DROP POLICY IF EXISTS "authenticated_all" ON categories;
DROP POLICY IF EXISTS "categories_sel" ON categories;
DROP POLICY IF EXISTS "categories_ins" ON categories;
DROP POLICY IF EXISTS "categories_upd" ON categories;
CREATE POLICY "categories_sel" ON categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories_ins" ON categories FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('product:create'));
CREATE POLICY "categories_upd" ON categories FOR UPDATE TO authenticated
  USING (app_has_perm('product:create')) WITH CHECK (app_has_perm('product:create'));

-- products
DROP POLICY IF EXISTS "authenticated_all" ON products;
DROP POLICY IF EXISTS "products_sel" ON products;
DROP POLICY IF EXISTS "products_ins" ON products;
DROP POLICY IF EXISTS "products_upd" ON products;
CREATE POLICY "products_sel" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_ins" ON products FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('product:create'));
CREATE POLICY "products_upd" ON products FOR UPDATE TO authenticated
  USING (app_has_perm('product:update')) WITH CHECK (app_has_perm('product:update'));

-- product_barcodes
DROP POLICY IF EXISTS "authenticated_all" ON product_barcodes;
DROP POLICY IF EXISTS "product_barcodes_sel" ON product_barcodes;
DROP POLICY IF EXISTS "product_barcodes_ins" ON product_barcodes;
DROP POLICY IF EXISTS "product_barcodes_del" ON product_barcodes;
CREATE POLICY "product_barcodes_sel" ON product_barcodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_barcodes_ins" ON product_barcodes FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('barcode:manage'));
CREATE POLICY "product_barcodes_del" ON product_barcodes FOR DELETE TO authenticated
  USING (app_has_perm('barcode:manage'));

-- price_tiers
DROP POLICY IF EXISTS "authenticated_all" ON price_tiers;
DROP POLICY IF EXISTS "price_tiers_sel" ON price_tiers;
DROP POLICY IF EXISTS "price_tiers_ins" ON price_tiers;
DROP POLICY IF EXISTS "price_tiers_upd" ON price_tiers;
DROP POLICY IF EXISTS "price_tiers_del" ON price_tiers;
CREATE POLICY "price_tiers_sel" ON price_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "price_tiers_ins" ON price_tiers FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('pricing:manage'));
CREATE POLICY "price_tiers_upd" ON price_tiers FOR UPDATE TO authenticated
  USING (app_has_perm('pricing:manage')) WITH CHECK (app_has_perm('pricing:manage'));
CREATE POLICY "price_tiers_del" ON price_tiers FOR DELETE TO authenticated
  USING (app_has_perm('pricing:manage'));

-- suppliers
DROP POLICY IF EXISTS "authenticated_all" ON suppliers;
DROP POLICY IF EXISTS "suppliers_sel" ON suppliers;
DROP POLICY IF EXISTS "suppliers_ins" ON suppliers;
DROP POLICY IF EXISTS "suppliers_upd" ON suppliers;
CREATE POLICY "suppliers_sel" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_ins" ON suppliers FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('supplier:create'));
CREATE POLICY "suppliers_upd" ON suppliers FOR UPDATE TO authenticated
  USING (app_has_perm('supplier:update')) WITH CHECK (app_has_perm('supplier:update'));

-- ============================================================
-- 3. SHOP-SCOPED OPERATIONAL TABLES — permission-aware writes.
--    (Receiving / transfer completion are RPC-only and need no
--     direct write policy.)
-- ============================================================

-- purchase_orders (create / approve / cancel still direct)
DROP POLICY IF EXISTS "authenticated_all" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_sel" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_ins" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_upd" ON purchase_orders;
CREATE POLICY "purchase_orders_sel" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_orders_ins" ON purchase_orders FOR INSERT TO authenticated
  WITH CHECK (app_can_for_shop('purchase:create', shop_id));
CREATE POLICY "purchase_orders_upd" ON purchase_orders FOR UPDATE TO authenticated
  USING (app_can_for_shop('purchase:create', shop_id) OR app_can_for_shop('purchase:approve', shop_id))
  WITH CHECK (app_can_for_shop('purchase:create', shop_id) OR app_can_for_shop('purchase:approve', shop_id));

-- purchase_order_items (created with the PO; receiving updates via RPC)
DROP POLICY IF EXISTS "authenticated_all" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_sel" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_ins" ON purchase_order_items;
CREATE POLICY "purchase_order_items_sel" ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_order_items_ins" ON purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('purchase:create'));

-- stock_transfers (create / approve / reject / cancel still direct)
DROP POLICY IF EXISTS "authenticated_all" ON stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_sel" ON stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_ins" ON stock_transfers;
DROP POLICY IF EXISTS "stock_transfers_upd" ON stock_transfers;
CREATE POLICY "stock_transfers_sel" ON stock_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_transfers_ins" ON stock_transfers FOR INSERT TO authenticated
  WITH CHECK (app_can_for_shop('transfer:create', from_shop_id));
CREATE POLICY "stock_transfers_upd" ON stock_transfers FOR UPDATE TO authenticated
  USING (app_can_for_shop('transfer:approve', from_shop_id) OR app_can_for_shop('transfer:cancel', from_shop_id))
  WITH CHECK (app_can_for_shop('transfer:approve', from_shop_id) OR app_can_for_shop('transfer:cancel', from_shop_id));

-- stock_transfer_items (created with the transfer; approval upserts approved_qty)
DROP POLICY IF EXISTS "authenticated_all" ON stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_sel" ON stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_ins" ON stock_transfer_items;
DROP POLICY IF EXISTS "stock_transfer_items_upd" ON stock_transfer_items;
CREATE POLICY "stock_transfer_items_sel" ON stock_transfer_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_transfer_items_ins" ON stock_transfer_items FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('transfer:create') OR app_has_perm('transfer:approve'));
CREATE POLICY "stock_transfer_items_upd" ON stock_transfer_items FOR UPDATE TO authenticated
  USING (app_has_perm('transfer:approve')) WITH CHECK (app_has_perm('transfer:approve'));

-- refund_void_requests (request creation direct; approve/reject via RPC)
DROP POLICY IF EXISTS "authenticated_all" ON refund_void_requests;
DROP POLICY IF EXISTS "refund_void_requests_sel" ON refund_void_requests;
DROP POLICY IF EXISTS "refund_void_requests_ins" ON refund_void_requests;
CREATE POLICY "refund_void_requests_sel" ON refund_void_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "refund_void_requests_ins" ON refund_void_requests FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (current_app_user()).id
    AND app_can_for_shop('sale:view', shop_id)
  );

-- reprint_logs (a user records their own reprints)
DROP POLICY IF EXISTS "authenticated_all" ON reprint_logs;
DROP POLICY IF EXISTS "reprint_logs_sel" ON reprint_logs;
DROP POLICY IF EXISTS "reprint_logs_ins" ON reprint_logs;
CREATE POLICY "reprint_logs_sel" ON reprint_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "reprint_logs_ins" ON reprint_logs FOR INSERT TO authenticated
  WITH CHECK (printed_by = (current_app_user()).id);

-- ============================================================
-- 4. AUDIT LOGS — append-only; a user may only write rows as themselves.
--    (Several create/approve/cancel flows still insert audit rows
--     directly; this policy keeps them working while preventing
--     forged actor ids. No UPDATE/DELETE policy => audit is immutable.)
-- ============================================================
DROP POLICY IF EXISTS "authenticated_all" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_sel" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_ins" ON audit_logs;
CREATE POLICY "audit_logs_sel" ON audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_logs_ins" ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = (current_app_user()).id);
