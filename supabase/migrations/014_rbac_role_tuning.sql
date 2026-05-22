-- ============================================================
-- Migration 014: RBAC role tuning (post backend-hardening)
-- Makes the roles less over-permissive without touching the
-- RPC / RLS architecture:
--   * Replaces role_default_permissions() with the tuned defaults.
--   * Remaps legacy permission names left in users' grant/revoke arrays.
--   * Updates the three RPCs whose permission CHECKS (not behaviour)
--     reference a renamed/split permission.
--
-- KEEP role_default_permissions() IN SYNC with DEFAULT_ROLE_PERMISSIONS
-- in src/types/domain.ts — they are the SQL and TypeScript halves of the
-- same contract. Any future change needs both + a new migration.
--
-- Permission changes vs migration 002:
--   removed : inventory:read, report:shop, report:profit
--   added   : inventory:view_stock, inventory:view_movements,
--             inventory:override_negative, pos:request_refund,
--             pos:request_void, sales:view_own_shift, receipt:reprint,
--             report:own_shift, report:shop_sales, report:shop_inventory,
--             report:shop_profit
--
-- Run AFTER 001-013. Idempotent (CREATE OR REPLACE + guarded UPDATE).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Tuned role default permissions.
--    SOURCE OF TRUTH alongside src/types/domain.ts DEFAULT_ROLE_PERMISSIONS.
-- ============================================================
CREATE OR REPLACE FUNCTION role_default_permissions(p_role text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE upper(p_role)
    WHEN 'ADMIN' THEN ARRAY[
      'shop:create','shop:read','shop:update','shop:delete',
      'user:create','user:read','user:update','user:delete',
      'product:create','product:read','product:update','product:delete','product:edit_price','barcode:manage',
      'inventory:view_stock','inventory:view_movements','inventory:adjust','inventory:damage','inventory:override_negative',
      'transfer:create','transfer:approve','transfer:cancel','transfer:view',
      'pos:create_sale','pos:apply_discount','pos:override_price','pos:override_stock',
      'pos:void_sale','pos:refund','pos:request_refund','pos:request_void',
      'sale:view','sales:view_own_shift','receipt:reprint',
      'supplier:create','supplier:read','supplier:update','supplier:delete',
      'purchase:create','purchase:approve','purchase:receive','purchase:view',
      'pricing:manage','approval:view',
      'shift:manage_own','shift:manage_all','shift:verify',
      'report:own_shift','report:shop_sales','report:shop_inventory','report:shop_profit','report:global',
      'audit:view_shop','audit:view_global'
    ]
    WHEN 'MANAGER' THEN ARRAY[
      'shop:read','user:read',
      'product:read','product:update','product:edit_price',
      'inventory:view_stock','inventory:view_movements','inventory:adjust','inventory:damage','inventory:override_negative',
      'transfer:create','transfer:approve','transfer:view',
      'pos:create_sale','pos:apply_discount','pos:override_price','pos:override_stock',
      'pos:void_sale','pos:refund','pos:request_refund','pos:request_void',
      'sale:view','sales:view_own_shift','receipt:reprint',
      'supplier:read',
      'purchase:create','purchase:receive','purchase:view','approval:view',
      'shift:manage_own','shift:manage_all','shift:verify',
      'report:own_shift','report:shop_sales','report:shop_inventory',
      'audit:view_shop'
    ]
    WHEN 'CASHIER' THEN ARRAY[
      'product:read','inventory:view_stock',
      'pos:create_sale','pos:apply_discount','pos:request_refund','pos:request_void',
      'sales:view_own_shift','receipt:reprint',
      'shift:manage_own','report:own_shift'
    ]
    WHEN 'BUYER' THEN ARRAY[
      'product:read','supplier:read','purchase:view','purchase:create'
    ]
    ELSE ARRAY[]::text[]
  END;
$$;

GRANT EXECUTE ON FUNCTION role_default_permissions(text) TO authenticated;

-- ============================================================
-- 2. Remap legacy permission names still stored in per-user
--    granted_permissions / revoked_permissions arrays so the
--    grant/deny overrides keep matching the renamed permissions.
--      inventory:read -> inventory:view_stock + inventory:view_movements
--      report:shop    -> report:shop_sales   + report:shop_inventory
--      report:profit  -> report:shop_profit
--    Guarded by an overlap test so re-runs are no-ops.
-- ============================================================
CREATE OR REPLACE FUNCTION remap_legacy_permissions(p_perms text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN p_perms IS NULL THEN NULL ELSE (
    SELECT COALESCE(array_agg(DISTINCT np), ARRAY[]::text[])
    FROM unnest(p_perms) AS op
    CROSS JOIN LATERAL unnest(
      CASE op
        WHEN 'inventory:read' THEN ARRAY['inventory:view_stock','inventory:view_movements']
        WHEN 'report:shop'    THEN ARRAY['report:shop_sales','report:shop_inventory']
        WHEN 'report:profit'  THEN ARRAY['report:shop_profit']
        ELSE ARRAY[op]
      END
    ) AS np
  ) END;
$$;

UPDATE users
SET
  granted_permissions = remap_legacy_permissions(granted_permissions),
  revoked_permissions = remap_legacy_permissions(revoked_permissions)
WHERE granted_permissions && ARRAY['inventory:read','report:shop','report:profit']
   OR revoked_permissions && ARRAY['inventory:read','report:shop','report:profit'];

DROP FUNCTION IF EXISTS remap_legacy_permissions(text[]);

-- ============================================================
-- 3. RPC permission-check updates.
--    Only the permission strings the RPCs CHECK change — the
--    transactional behaviour is reproduced verbatim from
--    migrations 008 and 012.
-- ============================================================

-- 3a. adjust_stock: the manual-adjustment negative-stock override now
--     uses inventory:override_negative instead of reusing pos:override_stock.
CREATE OR REPLACE FUNCTION adjust_stock(
  p_shop_id         text,
  p_product_id      text,
  p_adjustment_type text,
  p_quantity_delta  integer,
  p_reason          text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid    uuid := auth.uid();
  v_user        users;
  v_now         timestamptz := now();
  v_perm        text;
  v_ref_type    text;
  v_qty_before  integer;
  v_qty_after   integer;
  v_move_id     text;
  v_audit_id    text;
  v_message     text;
BEGIN
  -- 1-2. Authenticate via Supabase Auth and the app identity helper.
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 8. Adjustment type must be one of the supported manual types.
  IF p_adjustment_type NOT IN ('ADJUSTMENT', 'DAMAGE', 'PURCHASE_IN', 'RETURN_IN') THEN
    RAISE EXCEPTION 'Unsupported adjustment type: %', p_adjustment_type;
  END IF;

  -- Input sanity.
  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  -- 6. A reason is mandatory.
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  -- 7. The quantity change must not be zero.
  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Quantity change cannot be zero';
  END IF;

  -- The sign must match the adjustment type.
  IF p_adjustment_type = 'DAMAGE' AND p_quantity_delta > 0 THEN
    RAISE EXCEPTION 'Damage write-off must reduce stock';
  END IF;
  IF p_adjustment_type IN ('PURCHASE_IN', 'RETURN_IN') AND p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'Stock-in adjustments must increase stock';
  END IF;

  -- 3-4. Permission + shop scope (damage write-off needs the damage permission).
  v_perm := CASE WHEN p_adjustment_type = 'DAMAGE'
                 THEN 'inventory:damage' ELSE 'inventory:adjust' END;

  IF NOT app_has_perm(v_perm) THEN
    RAISE EXCEPTION 'You are not permitted to make this inventory adjustment';
  END IF;
  IF NOT app_can_for_shop(v_perm, p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to adjust inventory in this shop';
  END IF;

  -- 5. Product must exist.
  PERFORM 1 FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  -- 9-10. Ensure the inventory row exists, then lock it.
  INSERT INTO inventory (shop_id, product_id, qty_base_units)
  VALUES (p_shop_id, p_product_id, 0)
  ON CONFLICT (shop_id, product_id) DO NOTHING;

  SELECT qty_base_units INTO v_qty_before
    FROM inventory
   WHERE shop_id = p_shop_id AND product_id = p_product_id
   FOR UPDATE;

  -- 11. Compute the new quantity.
  v_qty_after := v_qty_before + p_quantity_delta;

  -- 12. Prevent negative stock unless the user can override.
  IF v_qty_after < 0 AND NOT app_has_perm('inventory:override_negative') THEN
    RAISE EXCEPTION 'Adjustment would drive stock negative (% to %)',
      v_qty_before, v_qty_after;
  END IF;

  -- 13. Apply the new quantity.
  UPDATE inventory SET qty_base_units = v_qty_after
   WHERE shop_id = p_shop_id AND product_id = p_product_id;

  -- 14. Inventory movement (ledger).
  v_ref_type := CASE WHEN p_adjustment_type = 'DAMAGE' THEN 'damage' ELSE 'adjustment' END;
  v_move_id  := 'move-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO inventory_movements (
    id, shop_id, product_id, type, qty_change,
    qty_before, qty_after, reason, reference_type, reference_id,
    created_by, created_at
  )
  VALUES (
    v_move_id, p_shop_id, p_product_id, p_adjustment_type, p_quantity_delta,
    v_qty_before, v_qty_after, p_reason, v_ref_type, NULL,
    v_user.id, v_now
  );

  -- 15. Audit row.
  v_message := 'Stock ' || p_adjustment_type || ': ' || p_quantity_delta
    || ' (from ' || v_qty_before || ' to ' || v_qty_after || '). ' || p_reason;
  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, p_shop_id, v_user.id, 'STOCK_' || p_adjustment_type, v_message,
    'Inventory', p_product_id, v_now
  );

  -- 16. Return everything the client needs to reconcile.
  RETURN jsonb_build_object(
    'inventory', jsonb_build_object(
      'shopId', p_shop_id, 'productId', p_product_id, 'qtyBaseUnits', v_qty_after
    ),
    'movement', jsonb_build_object(
      'id', v_move_id, 'shopId', p_shop_id, 'productId', p_product_id,
      'type', p_adjustment_type, 'qtyChange', p_quantity_delta,
      'qtyBefore', v_qty_before, 'qtyAfter', v_qty_after,
      'reason', p_reason, 'referenceType', v_ref_type, 'referenceId', NULL,
      'createdBy', v_user.id, 'createdAt', v_now
    ),
    'auditLog', jsonb_build_object(
      'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id,
      'actionType', 'STOCK_' || p_adjustment_type, 'message', v_message,
      'entityType', 'Inventory', 'entityId', p_product_id, 'createdAt', v_now
    )
  );
END;
$$;

-- 3b. create_refund_void_request: raising a request now needs the
--     dedicated pos:request_void / pos:request_refund permission
--     (cashier-level) instead of the broad sale:view.
CREATE OR REPLACE FUNCTION create_refund_void_request(
  p_sale_id text,
  p_type    text,
  p_reason  text,
  p_items   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_sale sales; v_now timestamptz := now();
  v_req_id text := 'refund-' || replace(gen_random_uuid()::text, '-', '');
  v_audit_id text;
  v_perm text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_type NOT IN ('VOID', 'PARTIAL') THEN
    RAISE EXCEPTION 'Unsupported request type: %', p_type;
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;

  v_perm := CASE WHEN p_type = 'VOID' THEN 'pos:request_void' ELSE 'pos:request_refund' END;
  IF NOT app_can_for_shop(v_perm, v_sale.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to request a % for sales in this shop', p_type;
  END IF;

  IF p_type = 'VOID' AND v_sale.status <> 'NORMAL' THEN
    RAISE EXCEPTION 'Only a normal sale can be voided';
  END IF;
  IF p_type = 'PARTIAL' AND v_sale.status = 'VOID' THEN
    RAISE EXCEPTION 'A voided sale cannot be refunded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM refund_void_requests
     WHERE sale_id = p_sale_id AND type = p_type AND status = 'REQUESTED'
  ) THEN
    RAISE EXCEPTION 'A pending % request already exists for this sale', p_type;
  END IF;

  INSERT INTO refund_void_requests (
    id, sale_id, shop_id, type, reason, created_by, created_at, items, status
  )
  VALUES (
    v_req_id, p_sale_id, v_sale.shop_id, p_type, p_reason, v_user.id, v_now,
    CASE WHEN p_type = 'PARTIAL' THEN p_items ELSE NULL END, 'REQUESTED'
  );

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_sale.shop_id, v_user.id,
    CASE WHEN p_type = 'VOID' THEN 'VOID_REQUESTED' ELSE 'REFUND_REQUESTED' END,
    p_type || ' requested for sale ' || v_sale.receipt_no || '. Reason: ' || p_reason,
    'Refund', v_req_id, v_now);

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_req_id, 'saleId', p_sale_id, 'shopId', v_sale.shop_id, 'type', p_type,
      'reason', p_reason, 'createdBy', v_user.id, 'createdAt', v_now,
      'items', CASE WHEN p_type = 'PARTIAL' THEN p_items ELSE NULL END, 'status', 'REQUESTED'),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_sale.shop_id, 'actorId', v_user.id,
      'actionType', CASE WHEN p_type = 'VOID' THEN 'VOID_REQUESTED' ELSE 'REFUND_REQUESTED' END,
      'message', p_type || ' requested for sale ' || v_sale.receipt_no || '. Reason: ' || p_reason,
      'entityType', 'Refund', 'entityId', v_req_id, 'createdAt', v_now))
  );
END;
$$;

-- 3c. log_receipt_reprint: reprinting now needs the dedicated
--     receipt:reprint permission instead of the broad sale:view.
CREATE OR REPLACE FUNCTION log_receipt_reprint(p_sale_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_sale sales; v_now timestamptz := now();
  v_reprint_id text := 'reprint-' || replace(gen_random_uuid()::text, '-', '');
  v_audit_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF v_sale.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT app_can_for_shop('receipt:reprint', v_sale.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to reprint receipts for this shop';
  END IF;

  INSERT INTO reprint_logs (id, sale_id, printed_by, printed_at)
  VALUES (v_reprint_id, p_sale_id, v_user.id, v_now);

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_sale.shop_id, v_user.id, 'REPRINT_RECEIPT',
    'Reprinted receipt ' || v_sale.receipt_no, 'Sale', p_sale_id, v_now);

  RETURN jsonb_build_object(
    'reprintLog', jsonb_build_object(
      'id', v_reprint_id, 'saleId', p_sale_id, 'printedBy', v_user.id, 'printedAt', v_now),
    'auditLog', jsonb_build_object(
      'id', v_audit_id, 'shopId', v_sale.shop_id, 'actorId', v_user.id, 'actionType', 'REPRINT_RECEIPT',
      'message', 'Reprinted receipt ' || v_sale.receipt_no,
      'entityType', 'Sale', 'entityId', p_sale_id, 'createdAt', v_now)
  );
END;
$$;

-- ============================================================
-- 4. Re-assert grants on the replaced RPCs (CREATE OR REPLACE keeps
--    existing privileges; re-issuing keeps this migration self-contained).
-- ============================================================
REVOKE ALL ON FUNCTION adjust_stock(text, text, text, integer, text)         FROM PUBLIC;
REVOKE ALL ON FUNCTION create_refund_void_request(text, text, text, jsonb)   FROM PUBLIC;
REVOKE ALL ON FUNCTION log_receipt_reprint(text)                             FROM PUBLIC;

GRANT EXECUTE ON FUNCTION adjust_stock(text, text, text, integer, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION create_refund_void_request(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION log_receipt_reprint(text)                           TO authenticated;
