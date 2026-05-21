-- ============================================================
-- Migration 006: Transactional purchase-receiving RPC
-- Moves purchase order receiving out of the frontend and into one
-- atomic, permission-checked Postgres function.
-- Run AFTER 001-005. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  v_auth_uid       uuid := auth.uid();
  v_user           users;
  v_po             purchase_orders;
  v_now            timestamptz := now();
  v_poitem         purchase_order_items;
  v_received       integer;
  v_qty_before     integer;
  v_qty_after      integer;
  v_total_received integer := 0;
  v_move_id        text;
  v_audit_id       text;
  v_items_out      jsonb := '[]'::jsonb;
  v_inv_out        jsonb := '[]'::jsonb;
  v_moves_out      jsonb := '[]'::jsonb;
  v_audit_out      jsonb := '[]'::jsonb;
BEGIN
  -- 1-2. Authenticate via Supabase Auth and the app identity helper.
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 5. Receiving permission.
  IF NOT app_has_perm('purchase:receive') THEN
    RAISE EXCEPTION 'You are not permitted to receive purchase orders';
  END IF;

  -- Input sanity.
  IF p_purchase_order_id IS NULL OR btrim(p_purchase_order_id) = '' THEN
    RAISE EXCEPTION 'Purchase order is required';
  END IF;

  IF p_received_items IS NOT NULL AND jsonb_typeof(p_received_items) <> 'array' THEN
    RAISE EXCEPTION 'Received items must be a JSON array';
  END IF;

  -- 3,7. Lock and load the purchase order.
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_purchase_order_id
   FOR UPDATE;

  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  -- 4. Must be in a receivable status.
  IF v_po.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Purchase order is not in a receivable (APPROVED) status';
  END IF;

  -- 6. Shop scope.
  IF NOT app_can_for_shop('purchase:receive', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to receive purchase orders in this shop';
  END IF;

  -- 8-9. Process each PO item (rows are locked as the cursor fetches them).
  FOR v_poitem IN
    SELECT * FROM purchase_order_items
     WHERE purchase_order_id = v_po.id
     ORDER BY id
     FOR UPDATE
  LOOP
    -- Received quantity: explicit input by product, else the ordered quantity.
    IF p_received_items IS NULL THEN
      v_received := v_poitem.ordered_qty;
    ELSE
      SELECT (e->>'received_qty')::integer
        INTO v_received
        FROM jsonb_array_elements(p_received_items) e
       WHERE e->>'product_id' = v_poitem.product_id
       LIMIT 1;
      v_received := COALESCE(v_received, v_poitem.ordered_qty);
    END IF;

    IF v_received < 0 THEN
      RAISE EXCEPTION 'Received quantity cannot be negative for product %', v_poitem.product_id;
    END IF;
    IF v_received > v_poitem.ordered_qty THEN
      RAISE EXCEPTION 'Received quantity exceeds ordered quantity for product %', v_poitem.product_id;
    END IF;

    -- Product must exist.
    PERFORM 1 FROM products WHERE id = v_poitem.product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_poitem.product_id;
    END IF;

    -- Record the received quantity on the PO item.
    UPDATE purchase_order_items
       SET received_qty = v_received
     WHERE id = v_poitem.id;

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', v_poitem.id,
      'purchaseOrderId', v_poitem.purchase_order_id,
      'productId', v_poitem.product_id,
      'orderedQty', v_poitem.ordered_qty,
      'receivedQty', v_received,
      'unitCostMmk', v_poitem.unit_cost_mmk,
      'lineTotalMmk', v_poitem.line_total_mmk
    ));

    -- A zero line means nothing was delivered: no stock movement.
    IF v_received = 0 THEN
      CONTINUE;
    END IF;
    v_total_received := v_total_received + v_received;

    -- Ensure the inventory row exists, then lock it (receiving may be the
    -- first time a product is stocked at this shop).
    INSERT INTO inventory (shop_id, product_id, qty_base_units)
    VALUES (v_po.shop_id, v_poitem.product_id, 0)
    ON CONFLICT (shop_id, product_id) DO NOTHING;

    SELECT qty_base_units INTO v_qty_before
      FROM inventory
     WHERE shop_id = v_po.shop_id AND product_id = v_poitem.product_id
     FOR UPDATE;

    v_qty_after := v_qty_before + v_received;

    UPDATE inventory
       SET qty_base_units = v_qty_after
     WHERE shop_id = v_po.shop_id AND product_id = v_poitem.product_id;

    -- Inventory movement (ledger).
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at
    )
    VALUES (
      v_move_id, v_po.shop_id, v_poitem.product_id, 'PURCHASE_IN', v_received,
      v_qty_before, v_qty_after, 'Purchase order ' || v_po.order_no || ' received',
      'purchase', v_po.id, v_user.id, v_now
    );

    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id,
      'shopId', v_po.shop_id,
      'productId', v_poitem.product_id,
      'type', 'PURCHASE_IN',
      'qtyChange', v_received,
      'qtyBefore', v_qty_before,
      'qtyAfter', v_qty_after,
      'reason', 'Purchase order ' || v_po.order_no || ' received',
      'referenceType', 'purchase',
      'referenceId', v_po.id,
      'createdBy', v_user.id,
      'createdAt', v_now
    ));

    v_inv_out := v_inv_out || jsonb_build_array(jsonb_build_object(
      'shopId', v_po.shop_id,
      'productId', v_poitem.product_id,
      'qtyBaseUnits', v_qty_after
    ));
  END LOOP;

  -- 10-11. Mark the purchase order received.
  UPDATE purchase_orders
     SET status = 'RECEIVED', received_by = v_user.id, received_at = v_now
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  -- 12. Audit row.
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

  -- 13. Return everything the client needs to reconcile.
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
