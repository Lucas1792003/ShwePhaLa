-- ============================================================
-- Migration 028: Unit-aware purchase receiving + stock adjustment
--
-- What changes:
--   * `purchase_order_items` gains optional unit-snapshot columns so a
--     receive of "10 Package (24 each)" can record both the entered
--     quantity (10) and the base-unit total (240) it converted to.
--   * `stock_transfer_items` gains the same shape — transfer creation
--     stays base-units this phase, but the RPC will propagate the
--     snapshot through to `inventory_movements` once the create UI
--     starts setting them. This avoids a second migration when the
--     transfer phase lands.
--   * `inventory_movements` gains the same optional snapshot columns
--     so every base-unit change can be paired with the user-entered
--     unit + qty + base_quantity at the time of the action.
--   * `receive_purchase_order` accepts optional `product_unit_id` and
--     `received_unit_qty` per item. Server validates the unit belongs
--     to the product and is active, then computes
--     base_qty = received_unit_qty × unit.base_quantity. Falls back to
--     the legacy `received_qty` (base units) when unit fields are
--     omitted, so the old client keeps working during deploy.
--   * `adjust_stock` accepts optional `p_product_unit_id` and
--     `p_unit_qty`. Same server-side conversion + snapshot rule.
--   * `complete_stock_transfer` propagates any unit snapshot already
--     present on `stock_transfer_items` into the movement rows.
--
-- Inventory storage is unchanged — every base-unit write still goes
-- through the same `inventory.qty_base_units` integer. Snapshots are
-- additive, read-only history for the UI.
--
-- Backward-compatible:
--   * Existing rows have NULL unit columns (legacy ledger entries
--     render without the "Entered as X Y" hint).
--   * Legacy clients that don't send unit fields still receive correctly.
--
-- Idempotent. Run AFTER 001-027.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema additions
-- ------------------------------------------------------------

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS product_unit_id              text REFERENCES product_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_name_snapshot           text,
  ADD COLUMN IF NOT EXISTS unit_base_quantity_snapshot  integer,
  ADD COLUMN IF NOT EXISTS selected_unit_quantity       integer,
  ADD COLUMN IF NOT EXISTS unit_purchase_price_snapshot integer;

ALTER TABLE stock_transfer_items
  ADD COLUMN IF NOT EXISTS product_unit_id              text REFERENCES product_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_name_snapshot           text,
  ADD COLUMN IF NOT EXISTS unit_base_quantity_snapshot  integer,
  ADD COLUMN IF NOT EXISTS selected_unit_quantity       integer;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS product_unit_id              text REFERENCES product_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_name_snapshot           text,
  ADD COLUMN IF NOT EXISTS unit_base_quantity_snapshot  integer,
  ADD COLUMN IF NOT EXISTS selected_unit_quantity       integer;

CREATE INDEX IF NOT EXISTS purchase_order_items_unit_idx
  ON purchase_order_items (product_unit_id)
  WHERE product_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_transfer_items_unit_idx
  ON stock_transfer_items (product_unit_id)
  WHERE product_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_movements_unit_idx
  ON inventory_movements (product_unit_id)
  WHERE product_unit_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. receive_purchase_order — unit-aware
--
-- Item shape (in `p_received_items`):
--   { "product_id": "...", "received_qty": <base int>           }   (legacy)
--   { "product_id": "...", "product_unit_id": "...",
--     "received_unit_qty": <int> }                                  (new)
--
-- When both legacy and new fields appear, the new ones win.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_purchase_order_id text,
  p_received_items    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid          uuid := auth.uid();
  v_user              users;
  v_po                purchase_orders;
  v_now               timestamptz := now();
  v_poitem            purchase_order_items;
  v_input             jsonb;
  v_received_base     integer;
  v_unit              product_units;
  v_unit_id           text;
  v_unit_qty          integer;
  v_qty_before        integer;
  v_qty_after         integer;
  v_total_received    integer := 0;
  v_move_id           text;
  v_audit_id          text;
  v_items_out         jsonb := '[]'::jsonb;
  v_inv_out           jsonb := '[]'::jsonb;
  v_moves_out         jsonb := '[]'::jsonb;
  v_audit_out         jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app_has_perm('purchase:receive') THEN
    RAISE EXCEPTION 'You are not permitted to receive purchase orders';
  END IF;

  IF p_purchase_order_id IS NULL OR btrim(p_purchase_order_id) = '' THEN
    RAISE EXCEPTION 'Purchase order is required';
  END IF;

  IF p_received_items IS NOT NULL AND jsonb_typeof(p_received_items) <> 'array' THEN
    RAISE EXCEPTION 'Received items must be a JSON array';
  END IF;

  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_purchase_order_id
   FOR UPDATE;

  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF v_po.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Purchase order is not in a receivable (APPROVED) status';
  END IF;

  IF NOT app_can_for_shop('purchase:receive', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to receive purchase orders in this shop';
  END IF;

  FOR v_poitem IN
    SELECT * FROM purchase_order_items
     WHERE purchase_order_id = v_po.id
     ORDER BY id
     FOR UPDATE
  LOOP
    -- Find this item's matching input row (by product_id).
    v_input := NULL;
    IF p_received_items IS NOT NULL THEN
      SELECT e
        INTO v_input
        FROM jsonb_array_elements(p_received_items) e
       WHERE e->>'product_id' = v_poitem.product_id
       LIMIT 1;
    END IF;

    v_unit_id  := NULLIF(v_input->>'product_unit_id', '');
    v_unit_qty := NULLIF(v_input->>'received_unit_qty', '')::integer;
    v_unit     := NULL;

    -- Unit-aware path. The server resolves the unit and computes base qty;
    -- the client number is only a hint.
    IF v_unit_id IS NOT NULL THEN
      SELECT * INTO v_unit
        FROM product_units
       WHERE id = v_unit_id
         AND product_id = v_poitem.product_id
         AND is_active = true;
      IF v_unit.id IS NULL THEN
        RAISE EXCEPTION 'Sellable unit % is not active for product %',
          v_unit_id, v_poitem.product_id;
      END IF;
      IF v_unit_qty IS NULL OR v_unit_qty < 0 THEN
        RAISE EXCEPTION 'Received unit qty must be zero or greater for product %', v_poitem.product_id;
      END IF;
      v_received_base := v_unit_qty * v_unit.base_quantity;
    ELSIF v_input IS NOT NULL THEN
      v_received_base := COALESCE(NULLIF(v_input->>'received_qty', '')::integer, v_poitem.ordered_qty);
    ELSE
      -- No input row for this PO item → default to ordered qty.
      v_received_base := v_poitem.ordered_qty;
    END IF;

    IF v_received_base < 0 THEN
      RAISE EXCEPTION 'Received quantity cannot be negative for product %', v_poitem.product_id;
    END IF;
    IF v_received_base > v_poitem.ordered_qty THEN
      RAISE EXCEPTION 'Received quantity exceeds ordered quantity for product %', v_poitem.product_id;
    END IF;

    PERFORM 1 FROM products WHERE id = v_poitem.product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_poitem.product_id;
    END IF;

    -- Persist the received quantity AND the unit snapshot (NULL when legacy).
    UPDATE purchase_order_items
       SET received_qty                  = v_received_base,
           product_unit_id               = COALESCE(v_unit.id, product_unit_id),
           unit_name_snapshot            = COALESCE(v_unit.name, unit_name_snapshot),
           unit_base_quantity_snapshot   = COALESCE(v_unit.base_quantity, unit_base_quantity_snapshot),
           selected_unit_quantity        = COALESCE(v_unit_qty, selected_unit_quantity),
           unit_purchase_price_snapshot  = COALESCE(v_unit.purchase_price_mmk, unit_purchase_price_snapshot)
     WHERE id = v_poitem.id;

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', v_poitem.id,
      'purchaseOrderId', v_poitem.purchase_order_id,
      'productId', v_poitem.product_id,
      'orderedQty', v_poitem.ordered_qty,
      'receivedQty', v_received_base,
      'unitCostMmk', v_poitem.unit_cost_mmk,
      'lineTotalMmk', v_poitem.line_total_mmk,
      'productUnitId', COALESCE(v_unit.id, v_poitem.product_unit_id),
      'unitNameSnapshot', COALESCE(v_unit.name, v_poitem.unit_name_snapshot),
      'unitBaseQuantitySnapshot', COALESCE(v_unit.base_quantity, v_poitem.unit_base_quantity_snapshot),
      'selectedUnitQuantity', COALESCE(v_unit_qty, v_poitem.selected_unit_quantity),
      'unitPurchasePriceSnapshot', COALESCE(v_unit.purchase_price_mmk, v_poitem.unit_purchase_price_snapshot)
    ));

    IF v_received_base = 0 THEN
      CONTINUE;
    END IF;
    v_total_received := v_total_received + v_received_base;

    INSERT INTO inventory (shop_id, product_id, qty_base_units)
    VALUES (v_po.shop_id, v_poitem.product_id, 0)
    ON CONFLICT (shop_id, product_id) DO NOTHING;

    SELECT qty_base_units INTO v_qty_before
      FROM inventory
     WHERE shop_id = v_po.shop_id AND product_id = v_poitem.product_id
     FOR UPDATE;

    v_qty_after := v_qty_before + v_received_base;

    UPDATE inventory
       SET qty_base_units = v_qty_after
     WHERE shop_id = v_po.shop_id AND product_id = v_poitem.product_id;

    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at,
      product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot,
      selected_unit_quantity
    )
    VALUES (
      v_move_id, v_po.shop_id, v_poitem.product_id, 'PURCHASE_IN', v_received_base,
      v_qty_before, v_qty_after, 'Purchase order ' || v_po.order_no || ' received',
      'purchase', v_po.id, v_user.id, v_now,
      v_unit.id, v_unit.name, v_unit.base_quantity, v_unit_qty
    );

    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id,
      'shopId', v_po.shop_id,
      'productId', v_poitem.product_id,
      'type', 'PURCHASE_IN',
      'qtyChange', v_received_base,
      'qtyBefore', v_qty_before,
      'qtyAfter', v_qty_after,
      'reason', 'Purchase order ' || v_po.order_no || ' received',
      'referenceType', 'purchase',
      'referenceId', v_po.id,
      'createdBy', v_user.id,
      'createdAt', v_now,
      'productUnitId', v_unit.id,
      'unitNameSnapshot', v_unit.name,
      'unitBaseQuantitySnapshot', v_unit.base_quantity,
      'selectedUnitQuantity', v_unit_qty
    ));

    v_inv_out := v_inv_out || jsonb_build_array(jsonb_build_object(
      'shopId', v_po.shop_id,
      'productId', v_poitem.product_id,
      'qtyBaseUnits', v_qty_after
    ));
  END LOOP;

  UPDATE purchase_orders
     SET status = 'RECEIVED', received_by = v_user.id, received_at = v_now
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_po.shop_id, v_user.id, 'PO_RECEIVED',
    'Purchase order ' || v_po.order_no || ' received (' || v_total_received || ' units)',
    'PurchaseOrder', v_po.id, v_now
  );

  v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', v_po.shop_id,
    'actorId', v_user.id,
    'actionType', 'PO_RECEIVED',
    'message', 'Purchase order ' || v_po.order_no || ' received (' || v_total_received || ' units)',
    'entityType', 'PurchaseOrder',
    'entityId', v_po.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'purchaseOrder', jsonb_build_object(
      'id', v_po.id,
      'orderNo', v_po.order_no,
      'shopId', v_po.shop_id,
      'supplierId', v_po.supplier_id,
      'status', v_po.status,
      'subtotalMmk', v_po.subtotal_mmk,
      'taxMmk', v_po.tax_mmk,
      'totalMmk', v_po.total_mmk,
      'notes', v_po.notes,
      'createdBy', v_po.created_by,
      'createdAt', v_po.created_at,
      'approvedBy', v_po.approved_by,
      'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by,
      'receivedAt', v_po.received_at
    ),
    'purchaseOrderItems', v_items_out,
    'inventory', v_inv_out,
    'movements', v_moves_out,
    'auditLogs', v_audit_out
  );
END;
$$;

REVOKE ALL ON FUNCTION receive_purchase_order(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_purchase_order(text, jsonb) TO authenticated;

-- ------------------------------------------------------------
-- 3. adjust_stock — accepts optional `p_product_unit_id` + `p_unit_qty`
--
-- Backward compat: when `p_product_unit_id` is NULL the function
-- behaves exactly like the original (raw base-unit delta).
-- When set, server computes:
--   base_delta = p_unit_qty * unit.base_quantity
--   sign       = same sign as the implicit p_quantity_delta (caller
--                still passes the sign on p_quantity_delta=±1 as a
--                direction hint, or we read it from adjustment type)
--
-- To keep the call site simple, we use `p_quantity_delta` as the
-- direction-and-fallback: if `p_unit_qty` is provided it overrides
-- the magnitude; the sign comes from p_quantity_delta.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION adjust_stock(
  p_shop_id         text,
  p_product_id      text,
  p_adjustment_type text,
  p_quantity_delta  integer,
  p_reason          text,
  p_product_unit_id text DEFAULT NULL,
  p_unit_qty        integer DEFAULT NULL
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
  v_unit        product_units;
  v_sign        integer;
  v_delta       integer;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_adjustment_type NOT IN ('ADJUSTMENT', 'DAMAGE', 'PURCHASE_IN', 'RETURN_IN') THEN
    RAISE EXCEPTION 'Unsupported adjustment type: %', p_adjustment_type;
  END IF;

  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Quantity change cannot be zero';
  END IF;

  -- Resolve the unit-aware delta when the caller picked a unit.
  -- Sign comes from p_quantity_delta; magnitude comes from p_unit_qty *
  -- unit.base_quantity. This keeps the sign semantics shared with the
  -- legacy path (DAMAGE → negative, PURCHASE_IN/RETURN_IN → positive,
  -- ADJUSTMENT → either) without doubling the parameter list.
  IF p_product_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit
      FROM product_units
     WHERE id = p_product_unit_id
       AND product_id = p_product_id
       AND is_active = true;
    IF v_unit.id IS NULL THEN
      RAISE EXCEPTION 'Sellable unit % is not active for product %', p_product_unit_id, p_product_id;
    END IF;
    IF p_unit_qty IS NULL OR p_unit_qty <= 0 THEN
      RAISE EXCEPTION 'Unit qty must be greater than zero when a sellable unit is selected';
    END IF;
    v_sign  := CASE WHEN p_quantity_delta < 0 THEN -1 ELSE 1 END;
    v_delta := v_sign * (p_unit_qty * v_unit.base_quantity);
  ELSE
    v_delta := p_quantity_delta;
  END IF;

  IF p_adjustment_type = 'DAMAGE' AND v_delta > 0 THEN
    RAISE EXCEPTION 'Damage write-off must reduce stock';
  END IF;
  IF p_adjustment_type IN ('PURCHASE_IN', 'RETURN_IN') AND v_delta < 0 THEN
    RAISE EXCEPTION 'Stock-in adjustments must increase stock';
  END IF;

  v_perm := CASE WHEN p_adjustment_type = 'DAMAGE'
                 THEN 'inventory:damage' ELSE 'inventory:adjust' END;

  IF NOT app_has_perm(v_perm) THEN
    RAISE EXCEPTION 'You are not permitted to make this inventory adjustment';
  END IF;
  IF NOT app_can_for_shop(v_perm, p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to adjust inventory in this shop';
  END IF;

  PERFORM 1 FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  INSERT INTO inventory (shop_id, product_id, qty_base_units)
  VALUES (p_shop_id, p_product_id, 0)
  ON CONFLICT (shop_id, product_id) DO NOTHING;

  SELECT qty_base_units INTO v_qty_before
    FROM inventory
   WHERE shop_id = p_shop_id AND product_id = p_product_id
   FOR UPDATE;

  v_qty_after := v_qty_before + v_delta;

  IF v_qty_after < 0 AND NOT app_has_perm('pos:override_stock') THEN
    RAISE EXCEPTION 'Adjustment would drive stock negative (% to %)',
      v_qty_before, v_qty_after;
  END IF;

  UPDATE inventory SET qty_base_units = v_qty_after
   WHERE shop_id = p_shop_id AND product_id = p_product_id;

  v_ref_type := CASE WHEN p_adjustment_type = 'DAMAGE' THEN 'damage' ELSE 'adjustment' END;
  v_move_id  := 'move-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO inventory_movements (
    id, shop_id, product_id, type, qty_change,
    qty_before, qty_after, reason, reference_type, reference_id,
    created_by, created_at,
    product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot,
    selected_unit_quantity
  )
  VALUES (
    v_move_id, p_shop_id, p_product_id, p_adjustment_type, v_delta,
    v_qty_before, v_qty_after, p_reason, v_ref_type, NULL,
    v_user.id, v_now,
    v_unit.id, v_unit.name, v_unit.base_quantity, p_unit_qty
  );

  v_message := 'Stock ' || p_adjustment_type || ': ' || v_delta
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

  RETURN jsonb_build_object(
    'inventory', jsonb_build_object(
      'shopId', p_shop_id, 'productId', p_product_id, 'qtyBaseUnits', v_qty_after
    ),
    'movement', jsonb_build_object(
      'id', v_move_id, 'shopId', p_shop_id, 'productId', p_product_id,
      'type', p_adjustment_type, 'qtyChange', v_delta,
      'qtyBefore', v_qty_before, 'qtyAfter', v_qty_after,
      'reason', p_reason, 'referenceType', v_ref_type, 'referenceId', NULL,
      'createdBy', v_user.id, 'createdAt', v_now,
      'productUnitId', v_unit.id,
      'unitNameSnapshot', v_unit.name,
      'unitBaseQuantitySnapshot', v_unit.base_quantity,
      'selectedUnitQuantity', p_unit_qty
    ),
    'auditLog', jsonb_build_object(
      'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id,
      'actionType', 'STOCK_' || p_adjustment_type, 'message', v_message,
      'entityType', 'Inventory', 'entityId', p_product_id, 'createdAt', v_now
    )
  );
END;
$$;

-- Drop the old 5-arg signature so PostgREST resolves to the new one.
DROP FUNCTION IF EXISTS adjust_stock(text, text, text, integer, text);

REVOKE ALL ON FUNCTION adjust_stock(text, text, text, integer, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_stock(text, text, text, integer, text, text, integer) TO authenticated;

-- ------------------------------------------------------------
-- 4. complete_stock_transfer — propagate any pre-set snapshot
--
-- This phase still requires `stock_transfer_items.transferred_qty` to
-- be the base-unit total. When a future migration teaches the create
-- step to write `product_unit_id` + `selected_unit_quantity` on each
-- item, this RPC already carries them through into the movement rows
-- without needing another update.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION complete_stock_transfer(p_transfer_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid    uuid := auth.uid();
  v_user        users;
  v_transfer    stock_transfers;
  v_now         timestamptz := now();
  v_titem       stock_transfer_items;
  v_qty         integer;
  v_src_before  integer;
  v_src_after   integer;
  v_dst_before  integer;
  v_dst_after   integer;
  v_item_count  integer := 0;
  v_move_id     text;
  v_audit_id    text;
  v_items_out   jsonb := '[]'::jsonb;
  v_inv_out     jsonb := '[]'::jsonb;
  v_moves_out   jsonb := '[]'::jsonb;
  v_audit_out   jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT app_has_perm('transfer:approve') THEN
    RAISE EXCEPTION 'You are not permitted to complete stock transfers';
  END IF;
  IF p_transfer_id IS NULL OR btrim(p_transfer_id) = '' THEN
    RAISE EXCEPTION 'Stock transfer is required';
  END IF;

  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN
    RAISE EXCEPTION 'Stock transfer not found';
  END IF;
  IF v_transfer.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Stock transfer is not in a completable (APPROVED) status';
  END IF;
  IF v_transfer.from_shop_id = v_transfer.to_shop_id THEN
    RAISE EXCEPTION 'Transfer source and destination shop are the same';
  END IF;
  IF NOT app_can_for_shop('transfer:approve', v_transfer.from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to complete transfers for this shop';
  END IF;

  PERFORM pg_advisory_xact_lock(
    least(hashtext('xfer:' || v_transfer.from_shop_id),
          hashtext('xfer:' || v_transfer.to_shop_id))
  );
  PERFORM pg_advisory_xact_lock(
    greatest(hashtext('xfer:' || v_transfer.from_shop_id),
             hashtext('xfer:' || v_transfer.to_shop_id))
  );

  FOR v_titem IN
    SELECT * FROM stock_transfer_items
     WHERE transfer_id = v_transfer.id
     ORDER BY id
     FOR UPDATE
  LOOP
    v_qty := COALESCE(v_titem.approved_qty, v_titem.requested_qty);

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Source shop: decrement.
    INSERT INTO inventory (shop_id, product_id, qty_base_units)
    VALUES (v_transfer.from_shop_id, v_titem.product_id, 0)
    ON CONFLICT (shop_id, product_id) DO NOTHING;

    SELECT qty_base_units INTO v_src_before
      FROM inventory
     WHERE shop_id = v_transfer.from_shop_id AND product_id = v_titem.product_id
     FOR UPDATE;

    v_src_after := v_src_before - v_qty;
    IF v_src_after < 0 THEN
      RAISE EXCEPTION 'Insufficient stock at source for %: have %, need %',
        v_titem.product_id, v_src_before, v_qty;
    END IF;

    UPDATE inventory SET qty_base_units = v_src_after
     WHERE shop_id = v_transfer.from_shop_id AND product_id = v_titem.product_id;

    -- Destination shop: increment.
    INSERT INTO inventory (shop_id, product_id, qty_base_units)
    VALUES (v_transfer.to_shop_id, v_titem.product_id, 0)
    ON CONFLICT (shop_id, product_id) DO NOTHING;

    SELECT qty_base_units INTO v_dst_before
      FROM inventory
     WHERE shop_id = v_transfer.to_shop_id AND product_id = v_titem.product_id
     FOR UPDATE;

    v_dst_after := v_dst_before + v_qty;
    UPDATE inventory SET qty_base_units = v_dst_after
     WHERE shop_id = v_transfer.to_shop_id AND product_id = v_titem.product_id;

    -- OUT movement (carries the snapshot if set).
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at,
      product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot,
      selected_unit_quantity
    )
    VALUES (
      v_move_id, v_transfer.from_shop_id, v_titem.product_id, 'TRANSFER_OUT', -v_qty,
      v_src_before, v_src_after, 'Stock transfer ' || v_transfer.transfer_no,
      'transfer', v_transfer.id, v_user.id, v_now,
      v_titem.product_unit_id, v_titem.unit_name_snapshot,
      v_titem.unit_base_quantity_snapshot, v_titem.selected_unit_quantity
    );

    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id,
      'shopId', v_transfer.from_shop_id,
      'productId', v_titem.product_id,
      'type', 'TRANSFER_OUT',
      'qtyChange', -v_qty,
      'qtyBefore', v_src_before,
      'qtyAfter', v_src_after,
      'reason', 'Stock transfer ' || v_transfer.transfer_no,
      'referenceType', 'transfer',
      'referenceId', v_transfer.id,
      'createdBy', v_user.id,
      'createdAt', v_now,
      'productUnitId', v_titem.product_unit_id,
      'unitNameSnapshot', v_titem.unit_name_snapshot,
      'unitBaseQuantitySnapshot', v_titem.unit_base_quantity_snapshot,
      'selectedUnitQuantity', v_titem.selected_unit_quantity
    ));

    -- IN movement (mirror snapshot).
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at,
      product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot,
      selected_unit_quantity
    )
    VALUES (
      v_move_id, v_transfer.to_shop_id, v_titem.product_id, 'TRANSFER_IN', v_qty,
      v_dst_before, v_dst_after, 'Stock transfer ' || v_transfer.transfer_no,
      'transfer', v_transfer.id, v_user.id, v_now,
      v_titem.product_unit_id, v_titem.unit_name_snapshot,
      v_titem.unit_base_quantity_snapshot, v_titem.selected_unit_quantity
    );

    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id,
      'shopId', v_transfer.to_shop_id,
      'productId', v_titem.product_id,
      'type', 'TRANSFER_IN',
      'qtyChange', v_qty,
      'qtyBefore', v_dst_before,
      'qtyAfter', v_dst_after,
      'reason', 'Stock transfer ' || v_transfer.transfer_no,
      'referenceType', 'transfer',
      'referenceId', v_transfer.id,
      'createdBy', v_user.id,
      'createdAt', v_now,
      'productUnitId', v_titem.product_unit_id,
      'unitNameSnapshot', v_titem.unit_name_snapshot,
      'unitBaseQuantitySnapshot', v_titem.unit_base_quantity_snapshot,
      'selectedUnitQuantity', v_titem.selected_unit_quantity
    ));

    UPDATE stock_transfer_items SET transferred_qty = v_qty WHERE id = v_titem.id;

    v_inv_out := v_inv_out
      || jsonb_build_array(jsonb_build_object(
          'shopId', v_transfer.from_shop_id,
          'productId', v_titem.product_id,
          'qtyBaseUnits', v_src_after))
      || jsonb_build_array(jsonb_build_object(
          'shopId', v_transfer.to_shop_id,
          'productId', v_titem.product_id,
          'qtyBaseUnits', v_dst_after));

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', v_titem.id,
      'transferId', v_titem.transfer_id,
      'productId', v_titem.product_id,
      'requestedQty', v_titem.requested_qty,
      'approvedQty', v_titem.approved_qty,
      'transferredQty', v_qty,
      'productUnitId', v_titem.product_unit_id,
      'unitNameSnapshot', v_titem.unit_name_snapshot,
      'unitBaseQuantitySnapshot', v_titem.unit_base_quantity_snapshot,
      'selectedUnitQuantity', v_titem.selected_unit_quantity
    ));

    v_item_count := v_item_count + 1;
  END LOOP;

  UPDATE stock_transfers
     SET status = 'COMPLETED', completed_at = v_now
   WHERE id = v_transfer.id
   RETURNING * INTO v_transfer;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_transfer.from_shop_id, v_user.id, 'TRANSFER_COMPLETED',
    'Stock transfer ' || v_transfer.transfer_no || ' completed (' || v_item_count || ' lines)',
    'StockTransfer', v_transfer.id, v_now
  );
  v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', v_transfer.from_shop_id,
    'actorId', v_user.id,
    'actionType', 'TRANSFER_COMPLETED',
    'message', 'Stock transfer ' || v_transfer.transfer_no || ' completed (' || v_item_count || ' lines)',
    'entityType', 'StockTransfer',
    'entityId', v_transfer.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'stockTransfer', jsonb_build_object(
      'id', v_transfer.id,
      'transferNo', v_transfer.transfer_no,
      'fromShopId', v_transfer.from_shop_id,
      'toShopId', v_transfer.to_shop_id,
      'status', v_transfer.status,
      'notes', v_transfer.notes,
      'createdBy', v_transfer.created_by,
      'createdAt', v_transfer.created_at,
      'approvedBy', v_transfer.approved_by,
      'approvedAt', v_transfer.approved_at,
      'completedAt', v_transfer.completed_at,
      'canceledBy', v_transfer.canceled_by,
      'canceledAt', v_transfer.canceled_at,
      'cancelReason', v_transfer.cancel_reason
    ),
    'stockTransferItems', v_items_out,
    'inventory', v_inv_out,
    'movements', v_moves_out,
    'auditLogs', v_audit_out
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_stock_transfer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_stock_transfer(text) TO authenticated;
