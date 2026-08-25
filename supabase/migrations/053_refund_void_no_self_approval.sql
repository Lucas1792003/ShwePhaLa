-- ============================================================
-- Migration 053: Block self-approval of refund/void requests
--
-- Flagged in docs/09-roadmap-todo.md: approve_refund_request /
-- approve_void_request had no check that the approver differs from the
-- requester. A MANAGER holds both the request permissions
-- (pos:request_refund/pos:request_void) and the approve permissions
-- (pos:refund/pos:void_sale) by default, so they could raise a refund/void
-- request and immediately approve their own, defeating the maker-checker
-- framing the UI presents. Within their existing authority either way, but
-- this closes the gap so a genuine second approver is always required.
-- Run AFTER 001-052. Idempotent (CREATE OR REPLACE) — full function bodies
-- copied unchanged from migration 005 with one guard added after the
-- existing shop-permission check.
-- ============================================================

CREATE OR REPLACE FUNCTION approve_refund_request(p_request_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid     uuid := auth.uid();
  v_user         users;
  v_request      refund_void_requests;
  v_sale         sales;
  v_now          timestamptz := now();
  v_item         jsonb;
  v_product_id   text;
  v_qty_units    integer;
  v_amount_mmk   integer;
  v_sale_qty     integer;
  v_prev_qty     integer;
  v_sale_amount  integer;
  v_prev_amount  integer;
  v_qty_before   integer;
  v_qty_after    integer;
  v_move_id      text;
  v_audit_id     text;
  v_movements    jsonb := '[]'::jsonb;
  v_inventory    jsonb := '[]'::jsonb;
  v_audit_logs   jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app_has_perm('pos:refund') THEN
    RAISE EXCEPTION 'You are not permitted to approve refunds';
  END IF;

  SELECT * INTO v_request
    FROM refund_void_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Refund request not found';
  END IF;

  IF v_request.type <> 'PARTIAL' THEN
    RAISE EXCEPTION 'Request is not a refund request';
  END IF;

  IF v_request.status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'Refund request is not pending';
  END IF;

  SELECT * INTO v_sale
    FROM sales
   WHERE id = v_request.sale_id
   FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Original sale not found';
  END IF;

  IF v_request.shop_id IS DISTINCT FROM v_sale.shop_id THEN
    RAISE EXCEPTION 'Refund request shop does not match sale shop';
  END IF;

  IF NOT app_can_for_shop('pos:refund', v_sale.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to approve refunds in this shop';
  END IF;

  IF v_request.created_by = v_user.id THEN
    RAISE EXCEPTION 'You cannot approve your own refund request';
  END IF;

  IF v_sale.status = 'VOID' THEN
    RAISE EXCEPTION 'Cannot refund a voided sale';
  END IF;

  IF v_request.items IS NULL OR jsonb_typeof(v_request.items) <> 'array' OR jsonb_array_length(v_request.items) = 0 THEN
    RAISE EXCEPTION 'Refund request has no items';
  END IF;

  IF (
    SELECT count(*)
      FROM jsonb_array_elements(v_request.items) item
  ) <> (
    SELECT count(DISTINCT COALESCE(item->>'productId', item->>'product_id'))
      FROM jsonb_array_elements(v_request.items) item
  ) THEN
    RAISE EXCEPTION 'A product appears more than once in the refund request; combine the lines';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_request.items) AS t(value)
  LOOP
    v_product_id := COALESCE(v_item->>'productId', v_item->>'product_id');
    v_qty_units := COALESCE(v_item->>'qtyUnits', v_item->>'qty_units')::integer;
    v_amount_mmk := COALESCE(v_item->>'amountMmk', v_item->>'amount_mmk')::integer;

    IF COALESCE(v_product_id, '') = '' THEN
      RAISE EXCEPTION 'Refund item product is required';
    END IF;

    IF v_qty_units IS NULL OR v_qty_units <= 0 THEN
      RAISE EXCEPTION 'Invalid refund quantity for %', v_product_id;
    END IF;

    IF v_amount_mmk IS NULL OR v_amount_mmk < 0 THEN
      RAISE EXCEPTION 'Invalid refund amount for %', v_product_id;
    END IF;

    SELECT si.qty_units, si.line_total_mmk
      INTO v_sale_qty, v_sale_amount
      FROM sale_items si
     WHERE si.sale_id = v_sale.id AND si.product_id = v_product_id;

    IF v_sale_qty IS NULL THEN
      RAISE EXCEPTION 'Refund item is not part of the sale: %', v_product_id;
    END IF;

    SELECT
      COALESCE(sum((COALESCE(item->>'qtyUnits', item->>'qty_units'))::integer), 0),
      COALESCE(sum((COALESCE(item->>'amountMmk', item->>'amount_mmk'))::integer), 0)
      INTO v_prev_qty, v_prev_amount
      FROM refund_void_requests r
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) item
     WHERE r.sale_id = v_sale.id
       AND r.type = 'PARTIAL'
       AND r.status = 'APPROVED'
       AND COALESCE(item->>'productId', item->>'product_id') = v_product_id;

    IF v_prev_qty + v_qty_units > v_sale_qty THEN
      RAISE EXCEPTION 'Refund quantity exceeds original sale quantity for %', v_product_id;
    END IF;

    IF v_prev_amount + v_amount_mmk > v_sale_amount THEN
      RAISE EXCEPTION 'Refund amount exceeds original sale amount for %', v_product_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_request.items) AS t(value)
  LOOP
    v_product_id := COALESCE(v_item->>'productId', v_item->>'product_id');
    v_qty_units := COALESCE(v_item->>'qtyUnits', v_item->>'qty_units')::integer;

    SELECT qty_base_units INTO v_qty_before
      FROM inventory
     WHERE shop_id = v_sale.shop_id AND product_id = v_product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory row not found for refunded item %', v_product_id;
    END IF;

    v_qty_after := v_qty_before + v_qty_units;

    UPDATE inventory
       SET qty_base_units = v_qty_after
     WHERE shop_id = v_sale.shop_id AND product_id = v_product_id;

    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at
    )
    VALUES (
      v_move_id, v_sale.shop_id, v_product_id, 'RETURN_IN', v_qty_units,
      v_qty_before, v_qty_after, 'Refund approved for ' || v_sale.receipt_no,
      'sale', v_sale.id, v_user.id, v_now
    );

    v_movements := v_movements || jsonb_build_array(jsonb_build_object(
      'id', v_move_id,
      'shopId', v_sale.shop_id,
      'productId', v_product_id,
      'type', 'RETURN_IN',
      'qtyChange', v_qty_units,
      'qtyBefore', v_qty_before,
      'qtyAfter', v_qty_after,
      'reason', 'Refund approved for ' || v_sale.receipt_no,
      'referenceType', 'sale',
      'referenceId', v_sale.id,
      'createdBy', v_user.id,
      'createdAt', v_now
    ));

    v_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
      'shopId', v_sale.shop_id,
      'productId', v_product_id,
      'qtyBaseUnits', v_qty_after
    ));
  END LOOP;

  UPDATE refund_void_requests
     SET status = 'APPROVED'
   WHERE id = v_request.id
   RETURNING * INTO v_request;

  UPDATE sales
     SET status = 'REFUNDED'
   WHERE id = v_sale.id
   RETURNING * INTO v_sale;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_sale.shop_id, v_user.id, 'REFUND',
    'Refund approved for sale ' || v_sale.receipt_no || '. Reason: ' || v_request.reason,
    'Refund', v_request.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', v_sale.shop_id,
    'actorId', v_user.id,
    'actionType', 'REFUND',
    'message', 'Refund approved for sale ' || v_sale.receipt_no || '. Reason: ' || v_request.reason,
    'entityType', 'Refund',
    'entityId', v_request.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_request.id,
      'saleId', v_request.sale_id,
      'shopId', v_request.shop_id,
      'type', v_request.type,
      'reason', v_request.reason,
      'createdBy', v_request.created_by,
      'createdAt', v_request.created_at,
      'items', v_request.items,
      'status', v_request.status
    ),
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'shopId', v_sale.shop_id,
      'shiftId', v_sale.shift_id,
      'receiptNo', v_sale.receipt_no,
      'cashierId', v_sale.cashier_id,
      'status', v_sale.status,
      'subtotalMmk', v_sale.subtotal_mmk,
      'discountMmk', v_sale.discount_mmk,
      'cartDiscountPct', v_sale.cart_discount_pct,
      'totalMmk', v_sale.total_mmk,
      'paymentMethod', v_sale.payment_method,
      'paidMmk', v_sale.paid_mmk,
      'changeMmk', v_sale.change_mmk,
      'createdAt', v_sale.created_at
    ),
    'inventory', v_inventory,
    'movements', v_movements,
    'auditLogs', v_audit_logs
  );
END;
$$;

CREATE OR REPLACE FUNCTION approve_void_request(p_request_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid    uuid := auth.uid();
  v_user        users;
  v_request     refund_void_requests;
  v_sale        sales;
  v_now         timestamptz := now();
  v_sale_item   sale_items;
  v_qty_before  integer;
  v_qty_after   integer;
  v_move_id     text;
  v_audit_id    text;
  v_movements   jsonb := '[]'::jsonb;
  v_inventory   jsonb := '[]'::jsonb;
  v_audit_logs  jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app_has_perm('pos:void_sale') THEN
    RAISE EXCEPTION 'You are not permitted to approve voids';
  END IF;

  SELECT * INTO v_request
    FROM refund_void_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Void request not found';
  END IF;

  IF v_request.type <> 'VOID' THEN
    RAISE EXCEPTION 'Request is not a void request';
  END IF;

  IF v_request.status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'Void request is not pending';
  END IF;

  SELECT * INTO v_sale
    FROM sales
   WHERE id = v_request.sale_id
   FOR UPDATE;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_request.shop_id IS DISTINCT FROM v_sale.shop_id THEN
    RAISE EXCEPTION 'Void request shop does not match sale shop';
  END IF;

  IF NOT app_can_for_shop('pos:void_sale', v_sale.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to approve voids in this shop';
  END IF;

  IF v_request.created_by = v_user.id THEN
    RAISE EXCEPTION 'You cannot approve your own void request';
  END IF;

  IF v_sale.status <> 'NORMAL' THEN
    RAISE EXCEPTION 'Sale is not voidable';
  END IF;

  FOR v_sale_item IN SELECT * FROM sale_items WHERE sale_id = v_sale.id
  LOOP
    SELECT qty_base_units INTO v_qty_before
      FROM inventory
     WHERE shop_id = v_sale.shop_id AND product_id = v_sale_item.product_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory row not found for void item %', v_sale_item.product_id;
    END IF;

    v_qty_after := v_qty_before + v_sale_item.qty_units;

    UPDATE inventory
       SET qty_base_units = v_qty_after
     WHERE shop_id = v_sale.shop_id AND product_id = v_sale_item.product_id;

    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at
    )
    VALUES (
      v_move_id, v_sale.shop_id, v_sale_item.product_id, 'RETURN_IN',
      v_sale_item.qty_units, v_qty_before, v_qty_after,
      'Void approved for ' || v_sale.receipt_no || ': ' || v_request.reason,
      'sale', v_sale.id, v_user.id, v_now
    );

    v_movements := v_movements || jsonb_build_array(jsonb_build_object(
      'id', v_move_id,
      'shopId', v_sale.shop_id,
      'productId', v_sale_item.product_id,
      'type', 'RETURN_IN',
      'qtyChange', v_sale_item.qty_units,
      'qtyBefore', v_qty_before,
      'qtyAfter', v_qty_after,
      'reason', 'Void approved for ' || v_sale.receipt_no || ': ' || v_request.reason,
      'referenceType', 'sale',
      'referenceId', v_sale.id,
      'createdBy', v_user.id,
      'createdAt', v_now
    ));

    v_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
      'shopId', v_sale.shop_id,
      'productId', v_sale_item.product_id,
      'qtyBaseUnits', v_qty_after
    ));
  END LOOP;

  UPDATE refund_void_requests
     SET status = 'APPROVED'
   WHERE id = v_request.id
   RETURNING * INTO v_request;

  UPDATE sales
     SET status = 'VOID'
   WHERE id = v_sale.id
   RETURNING * INTO v_sale;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_sale.shop_id, v_user.id, 'VOID_SALE',
    'Void approved for sale ' || v_sale.receipt_no || '. Reason: ' || v_request.reason,
    'Sale', v_sale.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', v_sale.shop_id,
    'actorId', v_user.id,
    'actionType', 'VOID_SALE',
    'message', 'Void approved for sale ' || v_sale.receipt_no || '. Reason: ' || v_request.reason,
    'entityType', 'Sale',
    'entityId', v_sale.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id', v_request.id,
      'saleId', v_request.sale_id,
      'shopId', v_request.shop_id,
      'type', v_request.type,
      'reason', v_request.reason,
      'createdBy', v_request.created_by,
      'createdAt', v_request.created_at,
      'items', v_request.items,
      'status', v_request.status
    ),
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'shopId', v_sale.shop_id,
      'shiftId', v_sale.shift_id,
      'receiptNo', v_sale.receipt_no,
      'cashierId', v_sale.cashier_id,
      'status', v_sale.status,
      'subtotalMmk', v_sale.subtotal_mmk,
      'discountMmk', v_sale.discount_mmk,
      'cartDiscountPct', v_sale.cart_discount_pct,
      'totalMmk', v_sale.total_mmk,
      'paymentMethod', v_sale.payment_method,
      'paidMmk', v_sale.paid_mmk,
      'changeMmk', v_sale.change_mmk,
      'createdAt', v_sale.created_at
    ),
    'inventory', v_inventory,
    'movements', v_movements,
    'auditLogs', v_audit_logs
  );
END;
$$;
