-- ============================================================
-- Migration 037: bill purchase orders at RECEIVED value
--
-- A PO may be received for less than the ordered quantity (partial receive).
-- Until now receiving added stock for the received qty but left
-- purchase_orders.total_mmk at the ORDERED amount, so supplier debt and the
-- payment modal over-stated what was owed. A received PO is terminal, so the
-- payable should equal what actually arrived.
--
-- This recomputes subtotal_mmk / total_mmk (and each line_total_mmk) from the
-- received quantities on receive, and returns paidMmk / paymentStatus so the
-- client store stays consistent. Everything else (unit-aware base conversion,
-- inventory + ledger writes, snapshots, audit) is unchanged from migration 028.
--
-- Idempotent. Run AFTER 001-036.
-- ============================================================

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

REVOKE ALL ON FUNCTION receive_purchase_order(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_purchase_order(text, jsonb) TO authenticated;
