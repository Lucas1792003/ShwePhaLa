-- ============================================================
-- Migration 021: Explicit `Shop is required` guards on the two
-- shop-scoped creation RPCs that were missing them.
--
-- Background. After the frontend stopped silently falling back to
-- `shops[0]` for ADMIN with no selected shop, every shop-scoped RPC
-- must reject a missing / blank `shop_id` with a clear error rather
-- than relying on indirect failure modes (NOT NULL constraint
-- violations, "Shop not found", or RLS) that produce confusing
-- messages.
--
-- The other shop-scoped RPCs already do this:
--   * complete_sale          -- 004 line 85: 'Shop is required'
--   * open_shift             -- 009 line 65: 'Shop is required'
--   * adjust_stock           -- 008/014    : 'Shop is required'
-- This migration adds the same guard to:
--   * create_purchase_order   (p_shop_id)
--   * create_stock_transfer   (p_from_shop_id AND p_to_shop_id)
--
-- The full RPC bodies are reproduced verbatim from migration 012 with
-- ONLY the guard checks added at the top. Idempotent (CREATE OR REPLACE).
-- ============================================================

-- create_purchase_order ---------------------------------------
CREATE OR REPLACE FUNCTION create_purchase_order(
  p_shop_id     text,
  p_supplier_id text,
  p_notes       text,
  p_items       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user      users;
  v_po_id     text := 'po-' || replace(gen_random_uuid()::text, '-', '');
  v_now       timestamptz := now();
  v_order_no  text;
  v_seq       integer;
  v_item      jsonb;
  v_qty       integer;
  v_cost      integer;
  v_line      integer;
  v_subtotal  integer := 0;
  v_audit_id  text;
  v_items_out jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Guard added by 021. Reject blank shop_id before any permission /
  -- "Shop not found" check so the operator sees a precise message.
  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;

  IF NOT app_can_for_shop('purchase:create', p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to create purchase orders for this shop';
  END IF;
  PERFORM 1 FROM shops WHERE id = p_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shop not found'; END IF;
  PERFORM 1 FROM suppliers WHERE id = p_supplier_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A purchase order needs at least one item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('po_seq:' || to_char(v_now, 'YYYYMMDD')));
  SELECT count(*) INTO v_seq FROM purchase_orders WHERE created_at::date = v_now::date;
  v_order_no := 'PO-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad((v_seq + 1)::text, 4, '0');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value)
  LOOP
    PERFORM 1 FROM products WHERE id = (v_item->>'product_id');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', (v_item->>'product_id');
    END IF;
    v_qty  := (v_item->>'ordered_qty')::integer;
    v_cost := (v_item->>'unit_cost_mmk')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid ordered quantity for %', (v_item->>'product_id');
    END IF;
    IF v_cost IS NULL OR v_cost < 0 THEN
      RAISE EXCEPTION 'Invalid unit cost for %', (v_item->>'product_id');
    END IF;
    v_line := v_qty * v_cost;
    v_subtotal := v_subtotal + v_line;
    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', 'poitem-' || replace(gen_random_uuid()::text, '-', ''),
      'purchaseOrderId', v_po_id, 'productId', v_item->>'product_id',
      'orderedQty', v_qty, 'unitCostMmk', v_cost, 'lineTotalMmk', v_line
    ));
  END LOOP;

  INSERT INTO purchase_orders (
    id, order_no, shop_id, supplier_id, status, subtotal_mmk, total_mmk,
    notes, created_by, created_at
  )
  VALUES (
    v_po_id, v_order_no, p_shop_id, p_supplier_id, 'DRAFT', v_subtotal, v_subtotal,
    p_notes, v_user.id, v_now
  );

  INSERT INTO purchase_order_items (
    id, purchase_order_id, product_id, ordered_qty, unit_cost_mmk, line_total_mmk
  )
  SELECT i->>'id', v_po_id, i->>'productId',
         (i->>'orderedQty')::integer, (i->>'unitCostMmk')::integer, (i->>'lineTotalMmk')::integer
    FROM jsonb_array_elements(v_items_out) AS t(i);

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, p_shop_id, v_user.id, 'PO_CREATED',
    'Purchase order ' || v_order_no || ' created with ' || jsonb_array_length(v_items_out) || ' item(s)',
    'PurchaseOrder', v_po_id, v_now);

  RETURN jsonb_build_object(
    'purchaseOrder', jsonb_build_object(
      'id', v_po_id, 'orderNo', v_order_no, 'shopId', p_shop_id, 'supplierId', p_supplier_id,
      'status', 'DRAFT', 'subtotalMmk', v_subtotal, 'totalMmk', v_subtotal,
      'notes', p_notes, 'createdBy', v_user.id, 'createdAt', v_now),
    'purchaseOrderItems', v_items_out,
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id, 'actionType', 'PO_CREATED',
      'message', 'Purchase order ' || v_order_no || ' created with ' || jsonb_array_length(v_items_out) || ' item(s)',
      'entityType', 'PurchaseOrder', 'entityId', v_po_id, 'createdAt', v_now))
  );
END;
$$;

-- create_stock_transfer ---------------------------------------
CREATE OR REPLACE FUNCTION create_stock_transfer(
  p_from_shop_id text,
  p_to_shop_id   text,
  p_notes        text,
  p_items        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user      users;
  v_tr_id     text := 'transfer-' || replace(gen_random_uuid()::text, '-', '');
  v_now       timestamptz := now();
  v_transfer_no text;
  v_seq       integer;
  v_item      jsonb;
  v_qty       integer;
  v_avail     integer;
  v_audit_id  text;
  v_items_out jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Guard added by 021. Both source AND destination must be picked.
  IF p_from_shop_id IS NULL OR btrim(p_from_shop_id) = '' THEN
    RAISE EXCEPTION 'Source shop is required';
  END IF;
  IF p_to_shop_id IS NULL OR btrim(p_to_shop_id) = '' THEN
    RAISE EXCEPTION 'Destination shop is required';
  END IF;

  IF NOT app_can_for_shop('transfer:create', p_from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to create transfers from this shop';
  END IF;
  IF p_from_shop_id = p_to_shop_id THEN
    RAISE EXCEPTION 'Source and destination shop must differ';
  END IF;
  PERFORM 1 FROM shops WHERE id = p_from_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source shop not found'; END IF;
  PERFORM 1 FROM shops WHERE id = p_to_shop_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Destination shop not found'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A transfer needs at least one item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('trf_seq:' || to_char(v_now, 'YYYYMMDD')));
  SELECT count(*) INTO v_seq FROM stock_transfers WHERE created_at::date = v_now::date;
  v_transfer_no := 'TRF-' || to_char(v_now, 'YYYYMMDD') || '-' || lpad((v_seq + 1)::text, 4, '0');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value)
  LOOP
    PERFORM 1 FROM products WHERE id = (v_item->>'product_id');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', (v_item->>'product_id');
    END IF;
    v_qty := (v_item->>'requested_qty')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid requested quantity for %', (v_item->>'product_id');
    END IF;
    SELECT qty_base_units INTO v_avail
      FROM inventory WHERE shop_id = p_from_shop_id AND product_id = (v_item->>'product_id');
    IF COALESCE(v_avail, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % at the source shop (have %, requested %)',
        (v_item->>'product_id'), COALESCE(v_avail, 0), v_qty;
    END IF;
    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', 'titem-' || replace(gen_random_uuid()::text, '-', ''),
      'transferId', v_tr_id, 'productId', v_item->>'product_id', 'requestedQty', v_qty
    ));
  END LOOP;

  INSERT INTO stock_transfers (
    id, transfer_no, from_shop_id, to_shop_id, status, notes, created_by, created_at
  )
  VALUES (v_tr_id, v_transfer_no, p_from_shop_id, p_to_shop_id, 'PENDING', p_notes, v_user.id, v_now);

  INSERT INTO stock_transfer_items (id, transfer_id, product_id, requested_qty)
  SELECT i->>'id', v_tr_id, i->>'productId', (i->>'requestedQty')::integer
    FROM jsonb_array_elements(v_items_out) AS t(i);

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, p_from_shop_id, v_user.id, 'TRANSFER_CREATED',
    'Transfer ' || v_transfer_no || ' created with ' || jsonb_array_length(v_items_out) || ' item(s)',
    'StockTransfer', v_tr_id, v_now);

  RETURN jsonb_build_object(
    'stockTransfer', jsonb_build_object(
      'id', v_tr_id, 'transferNo', v_transfer_no, 'fromShopId', p_from_shop_id,
      'toShopId', p_to_shop_id, 'status', 'PENDING', 'notes', p_notes,
      'createdBy', v_user.id, 'createdAt', v_now),
    'stockTransferItems', v_items_out,
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', p_from_shop_id, 'actorId', v_user.id, 'actionType', 'TRANSFER_CREATED',
      'message', 'Transfer ' || v_transfer_no || ' created with ' || jsonb_array_length(v_items_out) || ' item(s)',
      'entityType', 'StockTransfer', 'entityId', v_tr_id, 'createdAt', v_now))
  );
END;
$$;

-- Re-assert grants (CREATE OR REPLACE preserves them; re-issuing keeps
-- this migration self-contained should the function be dropped first).
REVOKE ALL ON FUNCTION create_purchase_order(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_stock_transfer(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_purchase_order(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION create_stock_transfer(text, text, text, jsonb) TO authenticated;
