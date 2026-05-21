-- ============================================================
-- Migration 007: Transactional stock-transfer completion RPC
-- Moves transfer completion out of the frontend and into one
-- atomic, permission-checked Postgres function.
-- Run AFTER 001-006. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  -- 1-2. Authenticate via Supabase Auth and the app identity helper.
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 5. Completion permission.
  IF NOT app_has_perm('transfer:approve') THEN
    RAISE EXCEPTION 'You are not permitted to complete stock transfers';
  END IF;

  IF p_transfer_id IS NULL OR btrim(p_transfer_id) = '' THEN
    RAISE EXCEPTION 'Stock transfer is required';
  END IF;

  -- 3,7. Lock and load the transfer.
  SELECT * INTO v_transfer
    FROM stock_transfers
   WHERE id = p_transfer_id
   FOR UPDATE;

  IF v_transfer.id IS NULL THEN
    RAISE EXCEPTION 'Stock transfer not found';
  END IF;

  -- 4. Must be in a completable status.
  IF v_transfer.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Stock transfer is not in a completable (APPROVED) status';
  END IF;

  IF v_transfer.from_shop_id = v_transfer.to_shop_id THEN
    RAISE EXCEPTION 'Transfer source and destination shop are the same';
  END IF;

  -- 6. Shop scope — completion is actioned at the source shop.
  IF NOT app_can_for_shop('transfer:approve', v_transfer.from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to complete transfers for this shop';
  END IF;

  -- Serialize transfers touching either shop. Locks are taken in sorted order
  -- so two concurrent transfers can never deadlock on these.
  PERFORM pg_advisory_xact_lock(
    hashtext('transfer:' || least(v_transfer.from_shop_id, v_transfer.to_shop_id)));
  PERFORM pg_advisory_xact_lock(
    hashtext('transfer:' || greatest(v_transfer.from_shop_id, v_transfer.to_shop_id)));

  -- 8-9. Process each transfer item (rows locked as the cursor fetches them).
  FOR v_titem IN
    SELECT * FROM stock_transfer_items
     WHERE transfer_id = v_transfer.id
     ORDER BY id
     FOR UPDATE
  LOOP
    v_qty := COALESCE(v_titem.approved_qty, v_titem.requested_qty);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid transfer quantity for product %', v_titem.product_id;
    END IF;

    -- Product must exist.
    PERFORM 1 FROM products WHERE id = v_titem.product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', v_titem.product_id;
    END IF;

    -- Lock the source inventory row (must exist to transfer out of it).
    SELECT qty_base_units INTO v_src_before
      FROM inventory
     WHERE shop_id = v_transfer.from_shop_id AND product_id = v_titem.product_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No inventory for % at the source shop', v_titem.product_id;
    END IF;

    -- Reject insufficient source stock.
    IF v_src_before < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % at the source shop: have %, need %',
        v_titem.product_id, v_src_before, v_qty;
    END IF;

    -- Ensure + lock the destination inventory row (may be the first time the
    -- product is stocked at the destination shop).
    INSERT INTO inventory (shop_id, product_id, qty_base_units)
    VALUES (v_transfer.to_shop_id, v_titem.product_id, 0)
    ON CONFLICT (shop_id, product_id) DO NOTHING;

    SELECT qty_base_units INTO v_dst_before
      FROM inventory
     WHERE shop_id = v_transfer.to_shop_id AND product_id = v_titem.product_id
     FOR UPDATE;

    v_src_after := v_src_before - v_qty;
    v_dst_after := v_dst_before + v_qty;

    -- Decrease source, increase destination.
    UPDATE inventory SET qty_base_units = v_src_after
     WHERE shop_id = v_transfer.from_shop_id AND product_id = v_titem.product_id;
    UPDATE inventory SET qty_base_units = v_dst_after
     WHERE shop_id = v_transfer.to_shop_id AND product_id = v_titem.product_id;

    -- Record the transferred quantity on the item.
    UPDATE stock_transfer_items SET transferred_qty = v_qty WHERE id = v_titem.id;

    -- TRANSFER_OUT movement (source).
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at
    )
    VALUES (
      v_move_id, v_transfer.from_shop_id, v_titem.product_id, 'TRANSFER_OUT', -v_qty,
      v_src_before, v_src_after,
      'Transfer ' || v_transfer.transfer_no || ' to ' || v_transfer.to_shop_id,
      'transfer', v_transfer.id, v_user.id, v_now
    );
    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id, 'shopId', v_transfer.from_shop_id, 'productId', v_titem.product_id,
      'type', 'TRANSFER_OUT', 'qtyChange', -v_qty,
      'qtyBefore', v_src_before, 'qtyAfter', v_src_after,
      'reason', 'Transfer ' || v_transfer.transfer_no || ' to ' || v_transfer.to_shop_id,
      'referenceType', 'transfer', 'referenceId', v_transfer.id,
      'createdBy', v_user.id, 'createdAt', v_now
    ));

    -- TRANSFER_IN movement (destination).
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at
    )
    VALUES (
      v_move_id, v_transfer.to_shop_id, v_titem.product_id, 'TRANSFER_IN', v_qty,
      v_dst_before, v_dst_after,
      'Transfer ' || v_transfer.transfer_no || ' from ' || v_transfer.from_shop_id,
      'transfer', v_transfer.id, v_user.id, v_now
    );
    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id, 'shopId', v_transfer.to_shop_id, 'productId', v_titem.product_id,
      'type', 'TRANSFER_IN', 'qtyChange', v_qty,
      'qtyBefore', v_dst_before, 'qtyAfter', v_dst_after,
      'reason', 'Transfer ' || v_transfer.transfer_no || ' from ' || v_transfer.from_shop_id,
      'referenceType', 'transfer', 'referenceId', v_transfer.id,
      'createdBy', v_user.id, 'createdAt', v_now
    ));

    v_inv_out := v_inv_out || jsonb_build_array(
      jsonb_build_object('shopId', v_transfer.from_shop_id, 'productId', v_titem.product_id, 'qtyBaseUnits', v_src_after),
      jsonb_build_object('shopId', v_transfer.to_shop_id, 'productId', v_titem.product_id, 'qtyBaseUnits', v_dst_after)
    );

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', v_titem.id, 'transferId', v_titem.transfer_id, 'productId', v_titem.product_id,
      'requestedQty', v_titem.requested_qty, 'approvedQty', v_titem.approved_qty,
      'transferredQty', v_qty
    ));

    v_item_count := v_item_count + 1;
  END LOOP;

  -- 10-11. Mark the transfer completed.
  UPDATE stock_transfers
     SET status = 'COMPLETED', completed_at = v_now
   WHERE id = v_transfer.id
   RETURNING * INTO v_transfer;

  -- 12. Audit row.
  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_transfer.from_shop_id, v_user.id, 'TRANSFER_COMPLETED',
    'Transfer ' || v_transfer.transfer_no || ' completed: ' || v_item_count || ' item(s) moved',
    'StockTransfer', v_transfer.id, v_now
  );
  v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id, 'shopId', v_transfer.from_shop_id, 'actorId', v_user.id,
    'actionType', 'TRANSFER_COMPLETED',
    'message', 'Transfer ' || v_transfer.transfer_no || ' completed: ' || v_item_count || ' item(s) moved',
    'entityType', 'StockTransfer', 'entityId', v_transfer.id, 'createdAt', v_now
  ));

  -- 13. Return everything the client needs to reconcile.
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
