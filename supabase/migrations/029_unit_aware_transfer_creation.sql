-- ============================================================
-- Migration 029: Unit-aware stock transfer creation
--
-- Inventory stays in base units. The create step now accepts a
-- product-specific sellable unit and selected unit quantity per item,
-- validates the unit server-side, converts to base units, and stores the
-- unit snapshot on stock_transfer_items. Migration 028's
-- complete_stock_transfer already propagates those snapshots into
-- TRANSFER_OUT / TRANSFER_IN inventory_movements.
--
-- Backward compatible:
--   * Existing callers may still send only requested_qty in base units.
--   * New callers send product_unit_id + selected_unit_quantity.
-- ============================================================

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
  v_user       users;
  v_tr_id      text := 'transfer-' || replace(gen_random_uuid()::text, '-', '');
  v_now        timestamptz := now();
  v_transfer_no text;
  v_seq        integer;
  v_item       jsonb;
  v_product_id text;
  v_unit_id    text;
  v_unit       product_units%ROWTYPE;
  v_selected_qty integer;
  v_base_qty   integer;
  v_avail      integer;
  v_audit_id   text;
  v_item_id    text;
  v_items_out  jsonb := '[]'::jsonb;
  v_stock      record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

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
    v_product_id := NULLIF(v_item->>'product_id', '');
    v_unit_id := NULLIF(v_item->>'product_unit_id', '');
    v_selected_qty := NULL;
    v_base_qty := NULL;
    v_unit := NULL;

    PERFORM 1 FROM products WHERE id = v_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', COALESCE(v_product_id, '');
    END IF;

    IF v_unit_id IS NOT NULL THEN
      v_selected_qty := COALESCE(
        NULLIF(v_item->>'selected_unit_quantity', '')::integer,
        NULLIF(v_item->>'unit_qty', '')::integer
      );
      IF v_selected_qty IS NULL OR v_selected_qty <= 0 THEN
        RAISE EXCEPTION 'Invalid selected unit quantity for %', v_product_id;
      END IF;

      SELECT * INTO v_unit
        FROM product_units
       WHERE id = v_unit_id
         AND product_id = v_product_id
         AND is_active = true;
      IF v_unit.id IS NULL THEN
        RAISE EXCEPTION 'Sellable unit % is not active for product %', v_unit_id, v_product_id;
      END IF;

      v_base_qty := v_selected_qty * v_unit.base_quantity;
    ELSE
      -- Legacy base-unit path. requested_qty is already base units.
      v_base_qty := NULLIF(v_item->>'requested_qty', '')::integer;
      IF v_base_qty IS NULL OR v_base_qty <= 0 THEN
        RAISE EXCEPTION 'Invalid requested quantity for %', v_product_id;
      END IF;
    END IF;

    v_item_id := 'titem-' || replace(gen_random_uuid()::text, '-', '');
    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', v_item_id,
      'transferId', v_tr_id,
      'productId', v_product_id,
      'requestedQty', v_base_qty,
      'productUnitId', v_unit_id,
      'unitNameSnapshot', CASE WHEN v_unit_id IS NULL THEN NULL ELSE v_unit.name END,
      'unitBaseQuantitySnapshot', CASE WHEN v_unit_id IS NULL THEN NULL ELSE v_unit.base_quantity END,
      'selectedUnitQuantity', v_selected_qty
    ));
  END LOOP;

  -- Validate combined stock by product, not line-by-line. This blocks
  -- mixed-unit over-requests such as 1 Case + 2 Can when only 25 cans exist.
  FOR v_stock IN
    SELECT i->>'productId' AS product_id,
           sum((i->>'requestedQty')::integer) AS requested_base_qty
      FROM jsonb_array_elements(v_items_out) AS t(i)
     GROUP BY i->>'productId'
  LOOP
    SELECT qty_base_units INTO v_avail
      FROM inventory
     WHERE shop_id = p_from_shop_id AND product_id = v_stock.product_id;

    IF COALESCE(v_avail, 0) < v_stock.requested_base_qty THEN
      RAISE EXCEPTION 'Insufficient stock for % at the source shop (have %, requested %)',
        v_stock.product_id, COALESCE(v_avail, 0), v_stock.requested_base_qty;
    END IF;
  END LOOP;

  INSERT INTO stock_transfers (
    id, transfer_no, from_shop_id, to_shop_id, status, notes, created_by, created_at
  )
  VALUES (v_tr_id, v_transfer_no, p_from_shop_id, p_to_shop_id, 'PENDING', p_notes, v_user.id, v_now);

  INSERT INTO stock_transfer_items (
    id, transfer_id, product_id, requested_qty,
    product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot,
    selected_unit_quantity
  )
  SELECT
    i->>'id',
    v_tr_id,
    i->>'productId',
    (i->>'requestedQty')::integer,
    NULLIF(i->>'productUnitId', ''),
    NULLIF(i->>'unitNameSnapshot', ''),
    NULLIF(i->>'unitBaseQuantitySnapshot', '')::integer,
    NULLIF(i->>'selectedUnitQuantity', '')::integer
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

-- Keep approval from stripping unit snapshots out of the client store.
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

  -- approved quantity defaults to the requested base-unit quantity
  UPDATE stock_transfer_items SET approved_qty = requested_qty WHERE transfer_id = v_t.id;
  UPDATE stock_transfers
     SET status = 'APPROVED', approved_by = v_user.id, approved_at = v_now
   WHERE id = v_t.id RETURNING * INTO v_t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'transferId', i.transfer_id,
    'productId', i.product_id,
    'requestedQty', i.requested_qty,
    'approvedQty', i.approved_qty,
    'transferredQty', i.transferred_qty,
    'productUnitId', i.product_unit_id,
    'unitNameSnapshot', i.unit_name_snapshot,
    'unitBaseQuantitySnapshot', i.unit_base_quantity_snapshot,
    'selectedUnitQuantity', i.selected_unit_quantity
  )), '[]'::jsonb)
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

REVOKE ALL ON FUNCTION create_stock_transfer(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_stock_transfer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_stock_transfer(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_stock_transfer(text) TO authenticated;
