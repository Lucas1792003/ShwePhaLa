-- ============================================================
-- Migration 012: Operational status / audit RPCs
-- Moves the remaining direct status + audit writes (purchase order
-- and stock transfer lifecycle, refund/void request creation,
-- receipt reprint, generic audit) into SECURITY DEFINER RPCs.
-- These RPCs do NOT touch inventory - inventory-moving flows are
-- already handled by complete_sale / receive_purchase_order /
-- complete_stock_transfer / adjust_stock / refund-void approval.
-- Run AFTER 001-011. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- PURCHASE ORDERS
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

-- approve_purchase_order --------------------------------------
CREATE OR REPLACE FUNCTION approve_purchase_order(p_purchase_order_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_po purchase_orders; v_now timestamptz := now(); v_audit_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status NOT IN ('DRAFT', 'SUBMITTED') THEN
    RAISE EXCEPTION 'Purchase order cannot be approved from status %', v_po.status;
  END IF;
  IF NOT app_can_for_shop('purchase:approve', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to approve purchase orders for this shop';
  END IF;

  UPDATE purchase_orders
     SET status = 'APPROVED', approved_by = v_user.id, approved_at = v_now
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_po.shop_id, v_user.id, 'PO_APPROVED',
    'Purchase order ' || v_po.order_no || ' approved', 'PurchaseOrder', v_po.id, v_now);

  RETURN jsonb_build_object(
    'purchaseOrder', jsonb_build_object(
      'id', v_po.id, 'orderNo', v_po.order_no, 'shopId', v_po.shop_id, 'supplierId', v_po.supplier_id,
      'status', v_po.status, 'subtotalMmk', v_po.subtotal_mmk, 'taxMmk', v_po.tax_mmk,
      'totalMmk', v_po.total_mmk, 'notes', v_po.notes, 'createdBy', v_po.created_by,
      'createdAt', v_po.created_at, 'approvedBy', v_po.approved_by, 'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by, 'receivedAt', v_po.received_at),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_po.shop_id, 'actorId', v_user.id, 'actionType', 'PO_APPROVED',
      'message', 'Purchase order ' || v_po.order_no || ' approved',
      'entityType', 'PurchaseOrder', 'entityId', v_po.id, 'createdAt', v_now))
  );
END;
$$;

-- cancel_purchase_order ---------------------------------------
CREATE OR REPLACE FUNCTION cancel_purchase_order(
  p_purchase_order_id text,
  p_reason            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_po purchase_orders; v_now timestamptz := now();
  v_audit_id text; v_msg text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status IN ('RECEIVED', 'CANCELED') THEN
    RAISE EXCEPTION 'Purchase order cannot be canceled from status %', v_po.status;
  END IF;
  IF NOT app_can_for_shop('purchase:create', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to cancel purchase orders for this shop';
  END IF;

  UPDATE purchase_orders SET status = 'CANCELED' WHERE id = v_po.id RETURNING * INTO v_po;

  v_msg := 'Purchase order ' || v_po.order_no || ' canceled'
           || COALESCE('. Reason: ' || NULLIF(btrim(p_reason), ''), '');
  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_po.shop_id, v_user.id, 'PO_CANCELED', v_msg, 'PurchaseOrder', v_po.id, v_now);

  RETURN jsonb_build_object(
    'purchaseOrder', jsonb_build_object(
      'id', v_po.id, 'orderNo', v_po.order_no, 'shopId', v_po.shop_id, 'supplierId', v_po.supplier_id,
      'status', v_po.status, 'subtotalMmk', v_po.subtotal_mmk, 'taxMmk', v_po.tax_mmk,
      'totalMmk', v_po.total_mmk, 'notes', v_po.notes, 'createdBy', v_po.created_by,
      'createdAt', v_po.created_at, 'approvedBy', v_po.approved_by, 'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by, 'receivedAt', v_po.received_at),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_po.shop_id, 'actorId', v_user.id, 'actionType', 'PO_CANCELED',
      'message', v_msg, 'entityType', 'PurchaseOrder', 'entityId', v_po.id, 'createdAt', v_now))
  );
END;
$$;

-- ============================================================
-- STOCK TRANSFERS
-- ============================================================

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

  IF NOT app_can_for_shop('transfer:create', p_from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to create transfers from this shop';
  END IF;
  IF p_from_shop_id = p_to_shop_id THEN
    RAISE EXCEPTION 'Source and destination shop must differ';
  END IF;
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

-- shared helper: build a stock_transfer jsonb object
CREATE OR REPLACE FUNCTION transfer_json(v_t stock_transfers)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'id', v_t.id, 'transferNo', v_t.transfer_no, 'fromShopId', v_t.from_shop_id,
    'toShopId', v_t.to_shop_id, 'status', v_t.status, 'notes', v_t.notes,
    'createdBy', v_t.created_by, 'createdAt', v_t.created_at,
    'approvedBy', v_t.approved_by, 'approvedAt', v_t.approved_at,
    'completedAt', v_t.completed_at, 'canceledBy', v_t.canceled_by,
    'canceledAt', v_t.canceled_at, 'cancelReason', v_t.cancel_reason);
$$;

-- approve_stock_transfer --------------------------------------
CREATE OR REPLACE FUNCTION approve_stock_transfer(p_transfer_id text)
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

  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'Stock transfer not found'; END IF;
  IF v_t.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transfer cannot be approved from status %', v_t.status;
  END IF;
  IF NOT app_can_for_shop('transfer:approve', v_t.from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to approve transfers for this shop';
  END IF;

  -- approved quantity defaults to the requested quantity
  UPDATE stock_transfer_items SET approved_qty = requested_qty WHERE transfer_id = v_t.id;
  UPDATE stock_transfers
     SET status = 'APPROVED', approved_by = v_user.id, approved_at = v_now
   WHERE id = v_t.id RETURNING * INTO v_t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id, 'transferId', i.transfer_id, 'productId', i.product_id,
    'requestedQty', i.requested_qty, 'approvedQty', i.approved_qty,
    'transferredQty', i.transferred_qty)), '[]'::jsonb)
    INTO v_items FROM stock_transfer_items i WHERE i.transfer_id = v_t.id;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_t.from_shop_id, v_user.id, 'TRANSFER_APPROVED',
    'Transfer ' || v_t.transfer_no || ' approved', 'StockTransfer', v_t.id, v_now);

  RETURN jsonb_build_object(
    'stockTransfer', transfer_json(v_t),
    'stockTransferItems', v_items,
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_t.from_shop_id, 'actorId', v_user.id, 'actionType', 'TRANSFER_APPROVED',
      'message', 'Transfer ' || v_t.transfer_no || ' approved',
      'entityType', 'StockTransfer', 'entityId', v_t.id, 'createdAt', v_now))
  );
END;
$$;

-- reject_stock_transfer ---------------------------------------
CREATE OR REPLACE FUNCTION reject_stock_transfer(
  p_transfer_id text, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_t stock_transfers; v_now timestamptz := now();
  v_audit_id text; v_msg text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'Stock transfer not found'; END IF;
  IF v_t.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transfer cannot be rejected from status %', v_t.status;
  END IF;
  IF NOT app_can_for_shop('transfer:approve', v_t.from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to reject transfers for this shop';
  END IF;

  v_msg := COALESCE(NULLIF(btrim(p_reason), ''), 'No reason given');
  UPDATE stock_transfers
     SET status = 'REJECTED', canceled_by = v_user.id, canceled_at = v_now, cancel_reason = v_msg
   WHERE id = v_t.id RETURNING * INTO v_t;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_t.from_shop_id, v_user.id, 'TRANSFER_REJECTED',
    'Transfer ' || v_t.transfer_no || ' rejected. Reason: ' || v_msg,
    'StockTransfer', v_t.id, v_now);

  RETURN jsonb_build_object(
    'stockTransfer', transfer_json(v_t),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_t.from_shop_id, 'actorId', v_user.id, 'actionType', 'TRANSFER_REJECTED',
      'message', 'Transfer ' || v_t.transfer_no || ' rejected. Reason: ' || v_msg,
      'entityType', 'StockTransfer', 'entityId', v_t.id, 'createdAt', v_now))
  );
END;
$$;

-- cancel_stock_transfer ---------------------------------------
CREATE OR REPLACE FUNCTION cancel_stock_transfer(
  p_transfer_id text, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_t stock_transfers; v_now timestamptz := now();
  v_audit_id text; v_msg text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'Stock transfer not found'; END IF;
  IF v_t.status IN ('COMPLETED', 'CANCELED') THEN
    RAISE EXCEPTION 'Transfer cannot be canceled from status %', v_t.status;
  END IF;
  IF NOT app_can_for_shop('transfer:cancel', v_t.from_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to cancel transfers for this shop';
  END IF;

  v_msg := COALESCE(NULLIF(btrim(p_reason), ''), 'No reason given');
  UPDATE stock_transfers
     SET status = 'CANCELED', canceled_by = v_user.id, canceled_at = v_now, cancel_reason = v_msg
   WHERE id = v_t.id RETURNING * INTO v_t;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, v_t.from_shop_id, v_user.id, 'TRANSFER_CANCELED',
    'Transfer ' || v_t.transfer_no || ' canceled. Reason: ' || v_msg,
    'StockTransfer', v_t.id, v_now);

  RETURN jsonb_build_object(
    'stockTransfer', transfer_json(v_t),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id, 'shopId', v_t.from_shop_id, 'actorId', v_user.id, 'actionType', 'TRANSFER_CANCELED',
      'message', 'Transfer ' || v_t.transfer_no || ' canceled. Reason: ' || v_msg,
      'entityType', 'StockTransfer', 'entityId', v_t.id, 'createdAt', v_now))
  );
END;
$$;

-- ============================================================
-- REFUND / VOID REQUEST CREATION
-- ============================================================
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
  IF NOT app_can_for_shop('sale:view', v_sale.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to act on sales for this shop';
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

-- ============================================================
-- RECEIPT REPRINT
-- ============================================================
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
  IF NOT app_can_for_shop('sale:view', v_sale.shop_id) THEN
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
-- GENERIC AUDIT EVENT
-- Lets non-RPC flows (product / category / shop / user / supplier /
-- price-tier management) record an audit row without a direct
-- audit_logs INSERT. actor_id is forced to the caller.
-- ============================================================
CREATE OR REPLACE FUNCTION log_audit_event(
  p_action_type text,
  p_message     text,
  p_entity_type text,
  p_entity_id   text,
  p_shop_id     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_now timestamptz := now();
  v_audit_id text := 'audit-' || replace(gen_random_uuid()::text, '-', '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message, entity_type, entity_id, created_at)
  VALUES (v_audit_id, p_shop_id, v_user.id, p_action_type, p_message, p_entity_type, p_entity_id, v_now);

  RETURN jsonb_build_object('auditLog', jsonb_build_object(
    'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id, 'actionType', p_action_type,
    'message', p_message, 'entityType', p_entity_type, 'entityId', p_entity_id, 'createdAt', v_now));
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
REVOKE ALL ON FUNCTION create_purchase_order(text, text, text, jsonb)        FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_purchase_order(text)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_purchase_order(text, text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION create_stock_transfer(text, text, text, jsonb)        FROM PUBLIC;
REVOKE ALL ON FUNCTION transfer_json(stock_transfers)                       FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_stock_transfer(text)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_stock_transfer(text, text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_stock_transfer(text, text)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION create_refund_void_request(text, text, text, jsonb)   FROM PUBLIC;
REVOKE ALL ON FUNCTION log_receipt_reprint(text)                             FROM PUBLIC;
REVOKE ALL ON FUNCTION log_audit_event(text, text, text, text, text)         FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_purchase_order(text, text, text, jsonb)      TO authenticated;
GRANT EXECUTE ON FUNCTION approve_purchase_order(text)                        TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_purchase_order(text, text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION create_stock_transfer(text, text, text, jsonb)      TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_transfer(text)                        TO authenticated;
GRANT EXECUTE ON FUNCTION reject_stock_transfer(text, text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_stock_transfer(text, text)                   TO authenticated;
GRANT EXECUTE ON FUNCTION create_refund_void_request(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION log_receipt_reprint(text)                           TO authenticated;
GRANT EXECUTE ON FUNCTION log_audit_event(text, text, text, text, text)       TO authenticated;
