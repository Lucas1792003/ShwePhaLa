-- ============================================================
-- Migration 038: stock transfer dispatch → receive (destination confirmation)
--
-- Splits the old one-step complete_stock_transfer into two steps:
--   * dispatch_stock_transfer  — source marks the transfer IN_TRANSIT
--                                (no inventory change; "hold at source").
--   * receive_stock_transfer   — destination confirms receipt; ONLY THEN is
--                                stock moved (source −, dest +) for the
--                                actually-received quantity (≤ approved).
--
-- Lifecycle: PENDING → APPROVED → IN_TRANSIT → COMPLETED.
-- Permissions reuse transfer:approve, checked on the SOURCE shop for dispatch
-- and the DESTINATION shop for receive (maker/checker, no new permission).
--
-- `complete_stock_transfer` (028) is left in place but unused by the client.
-- Idempotent. Run AFTER 001-037.
-- ============================================================

ALTER TABLE stock_transfers
  ADD COLUMN IF NOT EXISTS dispatched_by text,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_by   text,
  ADD COLUMN IF NOT EXISTS received_at   timestamptz;

-- shared helper already exists (transfer_json from migration 012) but predates
-- the new columns; replace it so dispatch/receive return the full shape.
CREATE OR REPLACE FUNCTION transfer_json(v_t stock_transfers)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id', v_t.id, 'transferNo', v_t.transfer_no, 'fromShopId', v_t.from_shop_id,
    'toShopId', v_t.to_shop_id, 'status', v_t.status, 'notes', v_t.notes,
    'createdBy', v_t.created_by, 'createdAt', v_t.created_at,
    'approvedBy', v_t.approved_by, 'approvedAt', v_t.approved_at,
    'dispatchedBy', v_t.dispatched_by, 'dispatchedAt', v_t.dispatched_at,
    'receivedBy', v_t.received_by, 'receivedAt', v_t.received_at,
    'completedAt', v_t.completed_at, 'canceledBy', v_t.canceled_by,
    'canceledAt', v_t.canceled_at, 'cancelReason', v_t.cancel_reason);
$$;

-- ------------------------------------------------------------
-- dispatch_stock_transfer — source releases goods (no inventory change)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION dispatch_stock_transfer(p_transfer_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_t stock_transfers; v_now timestamptz := now();
  v_audit_id text; v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
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

-- ------------------------------------------------------------
-- receive_stock_transfer — destination confirms; moves stock now
--
-- Item input shape (optional): [{ "product_id": "...", "received_qty": <int> }]
-- Defaults to the approved quantity; clamped to 0..approved_qty per line.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION receive_stock_transfer(
  p_transfer_id    text,
  p_received_items jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        users;
  v_transfer    stock_transfers;
  v_now         timestamptz := now();
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

REVOKE ALL ON FUNCTION dispatch_stock_transfer(text)              FROM PUBLIC;
REVOKE ALL ON FUNCTION receive_stock_transfer(text, jsonb)        FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dispatch_stock_transfer(text)            TO authenticated;
GRANT EXECUTE ON FUNCTION receive_stock_transfer(text, jsonb)      TO authenticated;
