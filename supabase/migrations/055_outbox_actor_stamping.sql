-- ============================================================
-- Migration 055: Reject outbox replay under the wrong actor
--
-- Flagged in docs/09-roadmap-todo.md: queued offline writes (stock
-- adjustments, transfer dispatch/receive, supplier payments, shift
-- open/close, refund/void requests) resolve the acting user at *sync*
-- time via current_app_user(), not at queue time. If Cashier A queues an
-- action offline and logs out before reconnecting, Cashier B logging in
-- next can trigger the replay under B's identity/audit trail.
-- (complete_sale is already safe — it independently checks shift
-- ownership, so it's not touched here.)
--
-- Fix: every offline-eligible RPC below (all except complete_sale) gains
-- an optional p_expected_actor_id text DEFAULT NULL param. The client
-- (src/stores/data/outbox.ts's enqueueOutbox()) now stamps the queuing
-- user's app id onto every outbox entry for these RPCs at enqueue time;
-- if replay happens under a different current_app_user(), the RPC raises
-- and drainOutbox() marks the entry "conflict" — visible on the existing
-- Sync Conflicts page — instead of silently executing under the new
-- user. NULL (the default — nothing sends it online) preserves the
-- normal non-outbox call path unchanged.
--
-- Each function body below is otherwise byte-for-byte unchanged from its
-- current live definition (045_offline_event_timestamps.sql) — only the
-- signature gains the trailing param and one guard block is inserted
-- right after the existing "not authenticated" check. Signature-changing,
-- so each needs DROP FUNCTION IF EXISTS on the current signature first,
-- same as 045 did for p_created_at.
--
-- Idempotent. Run AFTER 001-054.
-- ============================================================

-- ============================================================
-- adjust_stock
-- ============================================================
DROP FUNCTION IF EXISTS adjust_stock(text, text, text, integer, text, text, integer, timestamptz);

CREATE OR REPLACE FUNCTION adjust_stock(
  p_shop_id             text,
  p_product_id          text,
  p_adjustment_type     text,
  p_quantity_delta      integer,
  p_reason              text,
  p_product_unit_id     text DEFAULT NULL,
  p_unit_qty            integer DEFAULT NULL,
  p_created_at          timestamptz DEFAULT NULL,
  p_expected_actor_id   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid    uuid := auth.uid();
  v_user        users;
  v_now         timestamptz := resolve_event_time(p_created_at);
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

  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
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

REVOKE ALL ON FUNCTION adjust_stock(text, text, text, integer, text, text, integer, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_stock(text, text, text, integer, text, text, integer, timestamptz, text) TO authenticated;

-- ============================================================
-- receive_purchase_order
-- ============================================================
DROP FUNCTION IF EXISTS receive_purchase_order(text, jsonb, timestamptz);

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_purchase_order_id  text,
  p_received_items     jsonb DEFAULT NULL,
  p_created_at         timestamptz DEFAULT NULL,
  p_expected_actor_id  text DEFAULT NULL
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
  v_now               timestamptz := resolve_event_time(p_created_at);
  v_poitem            purchase_order_items;
  v_input             jsonb;
  v_received_base     integer;
  v_line_total        integer;
  v_unit              product_units;
  v_unit_id           text;
  v_unit_qty          integer;
  v_qty_before        integer;
  v_qty_after         integer;
  v_total_received    integer := 0;
  v_subtotal          integer := 0;
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

  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
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

    -- Bill at received value: each line total and the PO subtotal reflect what
    -- actually arrived, not what was ordered.
    v_line_total := v_received_base * v_poitem.unit_cost_mmk;
    v_subtotal := v_subtotal + v_line_total;

    -- Persist the received quantity, the recomputed line total, AND the unit
    -- snapshot (NULL when legacy).
    UPDATE purchase_order_items
       SET received_qty                  = v_received_base,
           line_total_mmk                = v_line_total,
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
      'lineTotalMmk', v_line_total,
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

  -- Bill at received value: PO totals reflect what arrived, so supplier debt
  -- and the payment modal never over-state the payable on a partial receive.
  UPDATE purchase_orders
     SET status        = 'RECEIVED',
         received_by   = v_user.id,
         received_at   = v_now,
         subtotal_mmk  = v_subtotal,
         total_mmk     = v_subtotal + COALESCE(tax_mmk, 0)
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
      'paidMmk', v_po.paid_mmk,
      'paymentStatus', v_po.payment_status,
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

REVOKE ALL ON FUNCTION receive_purchase_order(text, jsonb, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_purchase_order(text, jsonb, timestamptz, text) TO authenticated;

-- ============================================================
-- dispatch_stock_transfer
-- ============================================================
DROP FUNCTION IF EXISTS dispatch_stock_transfer(text, timestamptz);

CREATE OR REPLACE FUNCTION dispatch_stock_transfer(
  p_transfer_id        text,
  p_created_at         timestamptz DEFAULT NULL,
  p_expected_actor_id  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_t stock_transfers; v_now timestamptz := resolve_event_time(p_created_at);
  v_audit_id text; v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
  END IF;
  IF p_transfer_id IS NULL OR btrim(p_transfer_id) = '' THEN
    RAISE EXCEPTION 'Stock transfer is required';
  END IF;

  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'Stock transfer not found'; END IF;
  IF v_t.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Transfer cannot be dispatched from status %', v_t.status;
  END IF;
  IF NOT app_can_for_shop('transfer:approve', v_t.from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to dispatch transfers from this shop';
  END IF;

  UPDATE stock_transfers
     SET status = 'IN_TRANSIT', dispatched_by = v_user.id, dispatched_at = v_now
   WHERE id = v_t.id RETURNING * INTO v_t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'transferId', i.transfer_id, 'productId', i.product_id,
    'requestedQty', i.requested_qty, 'approvedQty', i.approved_qty,
    'transferredQty', i.transferred_qty,
    'productUnitId', i.product_unit_id, 'unitNameSnapshot', i.unit_name_snapshot,
    'unitBaseQuantitySnapshot', i.unit_base_quantity_snapshot,
    'selectedUnitQuantity', i.selected_unit_quantity)), '[]'::jsonb)
    INTO v_items FROM stock_transfer_items i WHERE i.transfer_id = v_t.id;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_t.from_shop_id, v_user.id, 'TRANSFER_DISPATCHED',
    'Transfer ' || v_t.transfer_no || ' dispatched', 'StockTransfer', v_t.id, v_now);

  RETURN jsonb_build_object(
    'stockTransfer', transfer_json(v_t),
    'stockTransferItems', v_items,
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_t.from_shop_id, 'actorId', v_user.id,
      'actionType', 'TRANSFER_DISPATCHED',
      'message', 'Transfer ' || v_t.transfer_no || ' dispatched',
      'entityType', 'StockTransfer', 'entityId', v_t.id, 'createdAt', v_now))
  );
END;
$$;

REVOKE ALL ON FUNCTION dispatch_stock_transfer(text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dispatch_stock_transfer(text, timestamptz, text) TO authenticated;

-- ============================================================
-- receive_stock_transfer
-- ============================================================
DROP FUNCTION IF EXISTS receive_stock_transfer(text, jsonb, timestamptz);

CREATE OR REPLACE FUNCTION receive_stock_transfer(
  p_transfer_id        text,
  p_received_items     jsonb DEFAULT NULL,
  p_created_at         timestamptz DEFAULT NULL,
  p_expected_actor_id  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        users;
  v_transfer    stock_transfers;
  v_now         timestamptz := resolve_event_time(p_created_at);
  v_titem       stock_transfer_items;
  v_approved    integer;
  v_input_qty   integer;
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
  END IF;
  IF p_transfer_id IS NULL OR btrim(p_transfer_id) = '' THEN
    RAISE EXCEPTION 'Stock transfer is required';
  END IF;
  IF p_received_items IS NOT NULL AND jsonb_typeof(p_received_items) <> 'array' THEN
    RAISE EXCEPTION 'Received items must be a JSON array';
  END IF;

  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN RAISE EXCEPTION 'Stock transfer not found'; END IF;
  IF v_transfer.status <> 'IN_TRANSIT' THEN
    RAISE EXCEPTION 'Transfer cannot be received from status %', v_transfer.status;
  END IF;
  IF v_transfer.from_shop_id = v_transfer.to_shop_id THEN
    RAISE EXCEPTION 'Transfer source and destination shop are the same';
  END IF;
  -- The DESTINATION confirms receipt.
  IF NOT app_can_for_shop('transfer:approve', v_transfer.to_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to receive transfers for this shop';
  END IF;

  PERFORM pg_advisory_xact_lock(
    least(hashtext('xfer:' || v_transfer.from_shop_id),
          hashtext('xfer:' || v_transfer.to_shop_id)));
  PERFORM pg_advisory_xact_lock(
    greatest(hashtext('xfer:' || v_transfer.from_shop_id),
             hashtext('xfer:' || v_transfer.to_shop_id)));

  FOR v_titem IN
    SELECT * FROM stock_transfer_items
     WHERE transfer_id = v_transfer.id
     ORDER BY id
     FOR UPDATE
  LOOP
    v_approved := COALESCE(v_titem.approved_qty, v_titem.requested_qty);

    -- Received qty: explicit per-product input, else the approved qty.
    v_input_qty := NULL;
    IF p_received_items IS NOT NULL THEN
      SELECT NULLIF(e->>'received_qty', '')::integer
        INTO v_input_qty
        FROM jsonb_array_elements(p_received_items) e
       WHERE e->>'product_id' = v_titem.product_id
       LIMIT 1;
    END IF;
    v_qty := COALESCE(v_input_qty, v_approved);

    IF v_qty < 0 THEN
      RAISE EXCEPTION 'Received quantity cannot be negative for product %', v_titem.product_id;
    END IF;
    IF v_qty > v_approved THEN
      RAISE EXCEPTION 'Received quantity exceeds approved quantity for product %', v_titem.product_id;
    END IF;

    UPDATE stock_transfer_items SET transferred_qty = v_qty WHERE id = v_titem.id;

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', v_titem.id, 'transferId', v_titem.transfer_id, 'productId', v_titem.product_id,
      'requestedQty', v_titem.requested_qty, 'approvedQty', v_titem.approved_qty,
      'transferredQty', v_qty,
      'productUnitId', v_titem.product_unit_id, 'unitNameSnapshot', v_titem.unit_name_snapshot,
      'unitBaseQuantitySnapshot', v_titem.unit_base_quantity_snapshot,
      'selectedUnitQuantity', v_titem.selected_unit_quantity));

    IF v_qty = 0 THEN
      CONTINUE;
    END IF;

    -- Source shop: decrement (stock was held here until now).
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

    -- OUT movement (source).
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at,
      product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot, selected_unit_quantity
    )
    VALUES (
      v_move_id, v_transfer.from_shop_id, v_titem.product_id, 'TRANSFER_OUT', -v_qty,
      v_src_before, v_src_after, 'Stock transfer ' || v_transfer.transfer_no,
      'transfer', v_transfer.id, v_user.id, v_now,
      v_titem.product_unit_id, v_titem.unit_name_snapshot,
      v_titem.unit_base_quantity_snapshot, v_titem.selected_unit_quantity);

    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id, 'shopId', v_transfer.from_shop_id, 'productId', v_titem.product_id,
      'type', 'TRANSFER_OUT', 'qtyChange', -v_qty, 'qtyBefore', v_src_before, 'qtyAfter', v_src_after,
      'reason', 'Stock transfer ' || v_transfer.transfer_no, 'referenceType', 'transfer',
      'referenceId', v_transfer.id, 'createdBy', v_user.id, 'createdAt', v_now,
      'productUnitId', v_titem.product_unit_id, 'unitNameSnapshot', v_titem.unit_name_snapshot,
      'unitBaseQuantitySnapshot', v_titem.unit_base_quantity_snapshot,
      'selectedUnitQuantity', v_titem.selected_unit_quantity));

    -- IN movement (destination).
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at,
      product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot, selected_unit_quantity
    )
    VALUES (
      v_move_id, v_transfer.to_shop_id, v_titem.product_id, 'TRANSFER_IN', v_qty,
      v_dst_before, v_dst_after, 'Stock transfer ' || v_transfer.transfer_no,
      'transfer', v_transfer.id, v_user.id, v_now,
      v_titem.product_unit_id, v_titem.unit_name_snapshot,
      v_titem.unit_base_quantity_snapshot, v_titem.selected_unit_quantity);

    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id, 'shopId', v_transfer.to_shop_id, 'productId', v_titem.product_id,
      'type', 'TRANSFER_IN', 'qtyChange', v_qty, 'qtyBefore', v_dst_before, 'qtyAfter', v_dst_after,
      'reason', 'Stock transfer ' || v_transfer.transfer_no, 'referenceType', 'transfer',
      'referenceId', v_transfer.id, 'createdBy', v_user.id, 'createdAt', v_now,
      'productUnitId', v_titem.product_unit_id, 'unitNameSnapshot', v_titem.unit_name_snapshot,
      'unitBaseQuantitySnapshot', v_titem.unit_base_quantity_snapshot,
      'selectedUnitQuantity', v_titem.selected_unit_quantity));

    v_inv_out := v_inv_out
      || jsonb_build_array(jsonb_build_object(
          'shopId', v_transfer.from_shop_id, 'productId', v_titem.product_id, 'qtyBaseUnits', v_src_after))
      || jsonb_build_array(jsonb_build_object(
          'shopId', v_transfer.to_shop_id, 'productId', v_titem.product_id, 'qtyBaseUnits', v_dst_after));

    v_item_count := v_item_count + 1;
  END LOOP;

  UPDATE stock_transfers
     SET status = 'COMPLETED', received_by = v_user.id, received_at = v_now, completed_at = v_now
   WHERE id = v_transfer.id
   RETURNING * INTO v_transfer;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_transfer.to_shop_id, v_user.id, 'TRANSFER_RECEIVED',
    'Stock transfer ' || v_transfer.transfer_no || ' received (' || v_item_count || ' lines)',
    'StockTransfer', v_transfer.id, v_now);

  RETURN jsonb_build_object(
    'stockTransfer', transfer_json(v_transfer),
    'stockTransferItems', v_items_out,
    'inventory', v_inv_out,
    'movements', v_moves_out,
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_transfer.to_shop_id, 'actorId', v_user.id,
      'actionType', 'TRANSFER_RECEIVED',
      'message', 'Stock transfer ' || v_transfer.transfer_no || ' received (' || v_item_count || ' lines)',
      'entityType', 'StockTransfer', 'entityId', v_transfer.id, 'createdAt', v_now))
  );
END;
$$;

REVOKE ALL ON FUNCTION receive_stock_transfer(text, jsonb, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_stock_transfer(text, jsonb, timestamptz, text) TO authenticated;

-- ============================================================
-- open_shift
-- ============================================================
DROP FUNCTION IF EXISTS open_shift(text, integer, timestamptz);

CREATE OR REPLACE FUNCTION open_shift(
  p_shop_id text,
  p_opening_cash_mmk integer,
  p_created_at timestamptz DEFAULT NULL,
  p_expected_actor_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid   uuid := auth.uid();
  v_user       users;
  v_shop       shops;
  v_shift      shifts;
  v_shift_id   text := 'shift-' || replace(gen_random_uuid()::text, '-', '');
  v_now        timestamptz := resolve_event_time(p_created_at);
  v_audit_id   text;
  v_audit_logs jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
  END IF;

  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;

  IF p_opening_cash_mmk IS NULL OR p_opening_cash_mmk < 0 THEN
    RAISE EXCEPTION 'Opening cash must be zero or greater';
  END IF;

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id AND is_active = true;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'Shop not found or inactive';
  END IF;

  IF NOT (
    app_can_for_shop('shift:manage_own', p_shop_id)
    OR app_can_for_shop('shift:manage_all', p_shop_id)
  ) THEN
    RAISE EXCEPTION 'You are not permitted to open shifts in this shop';
  END IF;

  -- Serialize open attempts for this cashier so the global-open-shift rule is
  -- reliable even across different shops.
  PERFORM pg_advisory_xact_lock(hashtext('open_shift:' || v_user.id));

  IF EXISTS (
    SELECT 1
      FROM shifts
     WHERE cashier_id = v_user.id AND ended_at IS NULL
     FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'This cashier already has an open shift';
  END IF;

  INSERT INTO shifts (
    id, shop_id, cashier_id, started_at, opening_cash_mmk
  )
  VALUES (
    v_shift_id, p_shop_id, v_user.id, v_now, p_opening_cash_mmk
  )
  RETURNING * INTO v_shift;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, p_shop_id, v_user.id, 'SHIFT_OPENED',
    'Opened shift with opening cash ' || p_opening_cash_mmk || ' MMK',
    'Shift', v_shift.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', p_shop_id,
    'actorId', v_user.id,
    'actionType', 'SHIFT_OPENED',
    'message', 'Opened shift with opening cash ' || p_opening_cash_mmk || ' MMK',
    'entityType', 'Shift',
    'entityId', v_shift.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'shift', jsonb_build_object(
      'id', v_shift.id,
      'shopId', v_shift.shop_id,
      'cashierId', v_shift.cashier_id,
      'startedAt', v_shift.started_at,
      'endedAt', v_shift.ended_at,
      'openingCashMmk', v_shift.opening_cash_mmk,
      'closingCashMmk', v_shift.closing_cash_mmk,
      'expectedCashMmk', v_shift.expected_cash_mmk,
      'varianceMmk', v_shift.variance_mmk,
      'varianceReason', v_shift.variance_reason
    ),
    'auditLogs', v_audit_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION open_shift(text, integer, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_shift(text, integer, timestamptz, text) TO authenticated;

-- ============================================================
-- close_shift
-- ============================================================
DROP FUNCTION IF EXISTS close_shift(text, integer, text, timestamptz);

CREATE OR REPLACE FUNCTION close_shift(
  p_shift_id text,
  p_closing_cash_mmk integer,
  p_variance_reason text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_expected_actor_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid      uuid := auth.uid();
  v_user          users;
  v_shift         shifts;
  v_now           timestamptz := resolve_event_time(p_created_at);
  v_cash_sales    integer := 0;
  v_cash_refunds  integer := 0;
  v_expected_cash integer;
  v_variance      integer;
  v_audit_id      text;
  v_audit_logs    jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
  END IF;

  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' THEN
    RAISE EXCEPTION 'Shift is required';
  END IF;

  IF p_closing_cash_mmk IS NULL OR p_closing_cash_mmk < 0 THEN
    RAISE EXCEPTION 'Closing cash must be zero or greater';
  END IF;

  SELECT * INTO v_shift
    FROM shifts
   WHERE id = p_shift_id
   FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  IF v_shift.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Shift is already closed';
  END IF;

  IF NOT (
    (v_shift.cashier_id = v_user.id AND app_can_for_shop('shift:manage_own', v_shift.shop_id))
    OR app_can_for_shop('shift:manage_all', v_shift.shop_id)
  ) THEN
    RAISE EXCEPTION 'You are not permitted to close this shift';
  END IF;

  SELECT COALESCE(sum(total_mmk), 0) INTO v_cash_sales
    FROM sales
   WHERE shift_id = v_shift.id
     AND payment_method = 'CASH'
     AND status <> 'VOID';

  SELECT COALESCE(sum((COALESCE(item->>'amountMmk', item->>'amount_mmk'))::integer), 0)
    INTO v_cash_refunds
    FROM refund_void_requests r
    JOIN sales s ON s.id = r.sale_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) item
   WHERE s.shift_id = v_shift.id
     AND s.payment_method = 'CASH'
     AND r.type = 'PARTIAL'
     AND r.status = 'APPROVED';

  v_expected_cash := v_shift.opening_cash_mmk + v_cash_sales - v_cash_refunds;
  v_variance := p_closing_cash_mmk - v_expected_cash;

  IF v_variance <> 0 AND COALESCE(btrim(p_variance_reason), '') = '' THEN
    RAISE EXCEPTION 'Variance reason is required when closing cash does not match expected cash';
  END IF;

  UPDATE shifts
     SET ended_at = v_now,
         closing_cash_mmk = p_closing_cash_mmk,
         expected_cash_mmk = v_expected_cash,
         variance_mmk = v_variance,
         variance_reason = NULLIF(btrim(p_variance_reason), '')
   WHERE id = v_shift.id
   RETURNING * INTO v_shift;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_shift.shop_id, v_user.id, 'SHIFT_CLOSED',
    'Closed shift. Expected cash ' || v_expected_cash || ' MMK, closing cash '
      || p_closing_cash_mmk || ' MMK, variance ' || v_variance || ' MMK',
    'Shift', v_shift.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', v_shift.shop_id,
    'actorId', v_user.id,
    'actionType', 'SHIFT_CLOSED',
    'message', 'Closed shift. Expected cash ' || v_expected_cash || ' MMK, closing cash '
      || p_closing_cash_mmk || ' MMK, variance ' || v_variance || ' MMK',
    'entityType', 'Shift',
    'entityId', v_shift.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'shift', jsonb_build_object(
      'id', v_shift.id,
      'shopId', v_shift.shop_id,
      'cashierId', v_shift.cashier_id,
      'startedAt', v_shift.started_at,
      'endedAt', v_shift.ended_at,
      'openingCashMmk', v_shift.opening_cash_mmk,
      'closingCashMmk', v_shift.closing_cash_mmk,
      'expectedCashMmk', v_shift.expected_cash_mmk,
      'varianceMmk', v_shift.variance_mmk,
      'varianceReason', v_shift.variance_reason
    ),
    'auditLogs', v_audit_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION close_shift(text, integer, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_shift(text, integer, text, timestamptz, text) TO authenticated;

-- ============================================================
-- record_supplier_payment
-- ============================================================
DROP FUNCTION IF EXISTS record_supplier_payment(text, integer, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_purchase_order_id text,
  p_amount_mmk integer,
  p_payment_method text,
  p_reference_no text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_expected_actor_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users;
  v_po purchase_orders;
  v_payment supplier_payments;
  v_now timestamptz := resolve_event_time(p_created_at);
  v_outstanding integer;
  v_new_paid integer;
  v_new_status text;
  v_payment_id text := 'suppay-' || replace(gen_random_uuid()::text, '-', '');
  v_audit_id text := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  v_method text := upper(COALESCE(NULLIF(btrim(p_payment_method), ''), ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
  END IF;

  IF p_purchase_order_id IS NULL OR btrim(p_purchase_order_id) = '' THEN
    RAISE EXCEPTION 'Purchase order is required';
  END IF;
  IF p_amount_mmk IS NULL OR p_amount_mmk <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF v_method NOT IN ('CASH', 'BANK', 'MOBILE', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported supplier payment method: %', p_payment_method;
  END IF;

  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_purchase_order_id
   FOR UPDATE;

  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status <> 'RECEIVED' THEN
    RAISE EXCEPTION 'Supplier payments can only be recorded against received purchase orders';
  END IF;
  IF NOT app_can_for_shop('supplier:payment_create', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to record supplier payments for this shop';
  END IF;

  v_outstanding := v_po.total_mmk - COALESCE(v_po.paid_mmk, 0);
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'Purchase order is already paid';
  END IF;
  IF p_amount_mmk > v_outstanding THEN
    RAISE EXCEPTION 'Payment amount exceeds outstanding balance';
  END IF;

  INSERT INTO supplier_payments (
    id, supplier_id, purchase_order_id, shop_id, amount_mmk,
    payment_method, reference_no, notes, paid_at, created_by, created_at
  )
  VALUES (
    v_payment_id, v_po.supplier_id, v_po.id, v_po.shop_id, p_amount_mmk,
    v_method, NULLIF(btrim(p_reference_no), ''), NULLIF(btrim(p_notes), ''),
    v_now, v_user.id, v_now
  )
  RETURNING * INTO v_payment;

  v_new_paid := COALESCE(v_po.paid_mmk, 0) + p_amount_mmk;
  v_new_status := CASE
    WHEN v_new_paid >= v_po.total_mmk THEN 'PAID'
    WHEN v_new_paid > 0 THEN 'PARTIAL'
    ELSE 'UNPAID'
  END;

  UPDATE purchase_orders
     SET paid_mmk = v_new_paid,
         payment_status = v_new_status
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_po.shop_id, v_user.id, 'SUPPLIER_PAYMENT_RECORDED',
    'Supplier payment recorded for ' || v_po.order_no || ': MMK ' || p_amount_mmk,
    'SupplierPayment', v_payment.id, v_now
  );

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
      'paidMmk', v_po.paid_mmk,
      'paymentStatus', v_po.payment_status,
      'supplierInvoiceNo', v_po.supplier_invoice_no,
      'deliveryNoteNo', v_po.delivery_note_no,
      'notes', v_po.notes,
      'createdBy', v_po.created_by,
      'createdAt', v_po.created_at,
      'approvedBy', v_po.approved_by,
      'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by,
      'receivedAt', v_po.received_at
    ),
    'supplierPayment', jsonb_build_object(
      'id', v_payment.id,
      'supplierId', v_payment.supplier_id,
      'purchaseOrderId', v_payment.purchase_order_id,
      'shopId', v_payment.shop_id,
      'amountMmk', v_payment.amount_mmk,
      'paymentMethod', v_payment.payment_method,
      'referenceNo', v_payment.reference_no,
      'notes', v_payment.notes,
      'paidAt', v_payment.paid_at,
      'createdBy', v_payment.created_by,
      'createdAt', v_payment.created_at,
      'voidedAt', v_payment.voided_at,
      'voidedBy', v_payment.voided_by,
      'voidReason', v_payment.void_reason
    ),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id,
      'shopId', v_po.shop_id,
      'actorId', v_user.id,
      'actionType', 'SUPPLIER_PAYMENT_RECORDED',
      'message', 'Supplier payment recorded for ' || v_po.order_no || ': MMK ' || p_amount_mmk,
      'entityType', 'SupplierPayment',
      'entityId', v_payment.id,
      'createdAt', v_now
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION record_supplier_payment(text, integer, text, text, text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_supplier_payment(text, integer, text, text, text, timestamptz, text) TO authenticated;

-- ============================================================
-- create_refund_void_request
-- ============================================================
DROP FUNCTION IF EXISTS create_refund_void_request(text, text, text, jsonb, timestamptz);

CREATE OR REPLACE FUNCTION create_refund_void_request(
  p_sale_id text,
  p_type    text,
  p_reason  text,
  p_items   jsonb DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_expected_actor_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_sale sales; v_now timestamptz := resolve_event_time(p_created_at);
  v_req_id text := 'refund-' || replace(gen_random_uuid()::text, '-', '');
  v_audit_id text;
  v_perm text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_expected_actor_id IS NOT NULL AND p_expected_actor_id <> v_user.id THEN
    RAISE EXCEPTION 'This offline action was queued by a different user — reconnect as them to sync it, or dismiss it from Sync Conflicts.';
  END IF;

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

REVOKE ALL ON FUNCTION create_refund_void_request(text, text, text, jsonb, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_refund_void_request(text, text, text, jsonb, timestamptz, text) TO authenticated;
