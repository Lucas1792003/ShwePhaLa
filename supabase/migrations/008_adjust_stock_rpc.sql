-- ============================================================
-- Migration 008: Transactional inventory-adjustment RPC
-- Moves manual stock adjustment / damage write-off out of the
-- frontend and into one atomic, permission-checked function.
-- Run AFTER 001-007. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  IF v_qty_after < 0 AND NOT app_has_perm('pos:override_stock') THEN
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

REVOKE ALL ON FUNCTION adjust_stock(text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_stock(text, text, text, integer, text) TO authenticated;
