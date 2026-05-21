-- ============================================================
-- Migration 004: Transactional sale checkout RPC - complete_sale()
-- Replaces the frontend multi-write POS checkout with a single
-- atomic, permission-checked Postgres function.
-- Run AFTER 001-003. Idempotent (CREATE OR REPLACE).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION complete_sale(
  p_shop_id            text,
  p_shift_id           text,
  p_payment_method     text,
  p_paid_mmk           integer,
  p_cart_discount_pct  numeric,
  p_items              jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid       uuid := auth.uid();
  v_user           users;
  v_shop           shops;
  v_sale_id        text := 'sale-' || replace(gen_random_uuid()::text, '-', '');
  v_now            timestamptz := now();
  v_receipt_no     text;
  v_seq            integer;
  v_can_ovr_stock  boolean;
  v_can_ovr_price  boolean;

  v_item           jsonb;
  v_product        products;
  v_qty_units      integer;
  v_unit_price     integer;
  v_item_disc      numeric;
  v_line_total     integer;
  v_qty_before     integer;
  v_qty_after      integer;
  v_price_ovr      boolean;
  v_expected_price integer;

  v_subtotal       integer := 0;
  v_after_disc     integer := 0;
  v_cart_disc      integer;
  v_total          integer;
  v_discount       integer;
  v_change         integer;

  v_computed       jsonb := '[]'::jsonb;
  v_c              jsonb;

  v_items_out      jsonb := '[]'::jsonb;
  v_moves_out      jsonb := '[]'::jsonb;
  v_inv_out        jsonb := '[]'::jsonb;
  v_audit_out      jsonb := '[]'::jsonb;

  v_move_id        text;
  v_audit_id       text;
  v_po_by          text;
  v_so_by          text;
BEGIN
  -- 1. Authenticate via Supabase Auth and the app identity helper.
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2-4. Permission plus shop scope.
  IF NOT app_has_perm('pos:create_sale') THEN
    RAISE EXCEPTION 'You are not permitted to create sales';
  END IF;

  IF NOT app_can_for_shop('pos:create_sale', p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to create sales in this shop';
  END IF;

  -- Input sanity.
  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;

  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' THEN
    RAISE EXCEPTION 'Open shift is required';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

  IF p_paid_mmk IS NULL OR p_paid_mmk < 0 THEN
    RAISE EXCEPTION 'Paid amount must be zero or greater';
  END IF;

  IF COALESCE(p_cart_discount_pct, 0) < 0 OR COALESCE(p_cart_discount_pct, 0) > 100 THEN
    RAISE EXCEPTION 'Cart discount must be between 0 and 100';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'No sale items provided';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_items) e
     WHERE COALESCE(e->>'product_id', '') = ''
  ) THEN
    RAISE EXCEPTION 'Product is required for every sale item';
  END IF;

  IF (SELECT count(*) FROM jsonb_array_elements(p_items) e)
   <> (SELECT count(DISTINCT e->>'product_id') FROM jsonb_array_elements(p_items) e) THEN
    RAISE EXCEPTION 'A product appears more than once in the cart; combine the lines';
  END IF;

  -- Serialize checkout per shop: race-free receipt numbers and inventory.
  PERFORM pg_advisory_xact_lock(hashtext('complete_sale:' || p_shop_id));

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'Shop not found';
  END IF;

  -- 5. There must be an open shift for this cashier/shop.
  PERFORM 1
    FROM shifts
   WHERE id = p_shift_id
     AND shop_id = p_shop_id
     AND cashier_id = v_user.id
     AND ended_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open shift for this cashier and shop';
  END IF;

  v_can_ovr_stock := app_has_perm('pos:override_stock');
  v_can_ovr_price := app_has_perm('pos:override_price');

  -- Receipt number: <shopCode>-<YYYYMMDD>-<NNNN>
  SELECT count(*) INTO v_seq
    FROM sales
   WHERE shop_id = p_shop_id AND created_at::date = v_now::date;

  v_receipt_no := v_shop.code || '-' || to_char(v_now, 'YYYYMMDD')
                  || '-' || lpad((v_seq + 1)::text, 4, '0');

  -- Pass 1: validate products, lock inventory rows, compute lines.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value)
  LOOP
    IF COALESCE(v_item->>'product_id', '') = '' THEN
      RAISE EXCEPTION 'Product is required for every sale item';
    END IF;

    SELECT * INTO v_product
      FROM products
     WHERE id = (v_item->>'product_id') AND is_active = true;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found or inactive: %', (v_item->>'product_id');
    END IF;

    v_qty_units := (v_item->>'qty')::integer
                   * COALESCE(NULLIF(v_item->>'units_per_item', '')::integer, 1);

    IF v_qty_units IS NULL OR v_qty_units <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for %', v_product.name;
    END IF;

    v_unit_price := (v_item->>'unit_price_mmk')::integer;
    v_item_disc  := COALESCE(NULLIF(v_item->>'item_discount_pct', '')::numeric, 0);

    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'Invalid unit price for %', v_product.name;
    END IF;

    IF v_item_disc < 0 OR v_item_disc > 100 THEN
      RAISE EXCEPTION 'Item discount must be between 0 and 100 for %', v_product.name;
    END IF;

    v_line_total := round(v_qty_units * v_unit_price * (1 - v_item_disc / 100))::integer;

    SELECT pt.price_mmk INTO v_expected_price
      FROM price_tiers pt
     WHERE pt.product_id = v_product.id
       AND pt.is_active = true
       AND (pt.shop_id = p_shop_id OR pt.shop_id IS NULL)
       AND v_qty_units >= pt.min_qty
       AND (pt.max_qty IS NULL OR v_qty_units <= pt.max_qty)
     ORDER BY
       CASE WHEN pt.shop_id = p_shop_id THEN 0 ELSE 1 END,
       pt.min_qty DESC
     LIMIT 1;

    v_expected_price := COALESCE(v_expected_price, v_product.price_mmk);
    v_price_ovr := COALESCE((v_item->>'price_overridden')::boolean, false)
                   OR v_unit_price IS DISTINCT FROM v_expected_price;

    -- A manual price requires the override permission.
    IF v_price_ovr AND NOT v_can_ovr_price THEN
      RAISE EXCEPTION 'You are not permitted to override prices';
    END IF;

    -- 8-9. Inventory must exist and is locked before deduction.
    SELECT qty_base_units INTO v_qty_before
      FROM inventory
     WHERE shop_id = p_shop_id AND product_id = v_product.id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory row not found for % in %', v_product.name, v_shop.name;
    END IF;

    v_qty_after := v_qty_before - v_qty_units;

    -- 10. Negative stock requires the stock-override permission.
    IF v_qty_after < 0 AND NOT v_can_ovr_stock THEN
      RAISE EXCEPTION 'Insufficient stock for %: have %, need %',
        v_product.name, v_qty_before, v_qty_units;
    END IF;

    v_subtotal   := v_subtotal + (v_unit_price * v_qty_units);
    v_after_disc := v_after_disc + v_line_total;

    v_computed := v_computed || jsonb_build_array(jsonb_build_object(
      'product_id',     v_product.id,
      'product_name',   v_product.name,
      'qty_units',      v_qty_units,
      'unit_price',     v_unit_price,
      'item_discount',  v_item_disc,
      'line_total',     v_line_total,
      'qty_before',     v_qty_before,
      'qty_after',      v_qty_after,
      'unit_label',     v_item->>'unit_label',
      'units_per_item', COALESCE(NULLIF(v_item->>'units_per_item', '')::integer, 1),
      'price_ovr',      v_price_ovr,
      'stock_ovr',      (v_qty_after < 0)
    ));
  END LOOP;

  -- Totals are recomputed server-side from the validated lines.
  v_cart_disc := round(v_after_disc * COALESCE(p_cart_discount_pct, 0) / 100)::integer;
  v_total     := greatest(0, v_after_disc - v_cart_disc);
  v_discount  := v_subtotal - v_total;
  v_change    := greatest(0, p_paid_mmk - v_total);

  IF p_paid_mmk < v_total THEN
    RAISE EXCEPTION 'Paid amount is less than the sale total';
  END IF;

  -- 11. Insert the sale.
  INSERT INTO sales (
    id, shop_id, shift_id, receipt_no, cashier_id, status,
    subtotal_mmk, discount_mmk, cart_discount_pct, total_mmk,
    payment_method, paid_mmk, change_mmk, created_at
  )
  VALUES (
    v_sale_id, p_shop_id, p_shift_id, v_receipt_no, v_user.id, 'NORMAL',
    v_subtotal, v_discount, COALESCE(p_cart_discount_pct, 0), v_total,
    p_payment_method, p_paid_mmk, v_change, v_now
  );

  -- Pass 2: write items, inventory, movements, override audits.
  FOR v_c IN SELECT value FROM jsonb_array_elements(v_computed) AS t(value)
  LOOP
    v_po_by := CASE WHEN (v_c->>'price_ovr')::boolean THEN v_user.id ELSE NULL END;
    v_so_by := CASE WHEN (v_c->>'stock_ovr')::boolean THEN v_user.id ELSE NULL END;

    -- 12. Sale item.
    INSERT INTO sale_items (
      sale_id, product_id, qty_units, unit_price_mmk,
      item_discount_pct, line_total_mmk, price_overridden_by,
      unit_label, units_per_item, stock_override_by
    )
    VALUES (
      v_sale_id, v_c->>'product_id', (v_c->>'qty_units')::integer,
      (v_c->>'unit_price')::integer, NULLIF((v_c->>'item_discount')::numeric, 0),
      (v_c->>'line_total')::integer, v_po_by, v_c->>'unit_label',
      (v_c->>'units_per_item')::integer, v_so_by
    );

    -- 13. Inventory level.
    UPDATE inventory
       SET qty_base_units = (v_c->>'qty_after')::integer
     WHERE shop_id = p_shop_id AND product_id = v_c->>'product_id';

    -- 14. Inventory movement ledger.
    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at
    )
    VALUES (
      v_move_id, p_shop_id, v_c->>'product_id', 'SALE_OUT',
      -(v_c->>'qty_units')::integer, (v_c->>'qty_before')::integer,
      (v_c->>'qty_after')::integer, 'Sale ' || v_receipt_no,
      'sale', v_sale_id, v_user.id, v_now
    );

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'saleId', v_sale_id,
      'productId', v_c->>'product_id',
      'qtyUnits', (v_c->>'qty_units')::integer,
      'unitPriceMmk', (v_c->>'unit_price')::integer,
      'itemDiscountPct', NULLIF((v_c->>'item_discount')::numeric, 0),
      'lineTotalMmk', (v_c->>'line_total')::integer,
      'priceOverriddenBy', v_po_by,
      'unitLabel', v_c->>'unit_label',
      'unitsPerItem', (v_c->>'units_per_item')::integer,
      'stockOverrideBy', v_so_by
    ));

    v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
      'id', v_move_id,
      'shopId', p_shop_id,
      'productId', v_c->>'product_id',
      'type', 'SALE_OUT',
      'qtyChange', -(v_c->>'qty_units')::integer,
      'qtyBefore', (v_c->>'qty_before')::integer,
      'qtyAfter', (v_c->>'qty_after')::integer,
      'reason', 'Sale ' || v_receipt_no,
      'referenceType', 'sale',
      'referenceId', v_sale_id,
      'createdBy', v_user.id,
      'createdAt', v_now
    ));

    v_inv_out := v_inv_out || jsonb_build_array(jsonb_build_object(
      'shopId', p_shop_id,
      'productId', v_c->>'product_id',
      'qtyBaseUnits', (v_c->>'qty_after')::integer
    ));

    -- 15. Override audits.
    IF v_po_by IS NOT NULL THEN
      v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

      INSERT INTO audit_logs (
        id, shop_id, actor_id, action_type, message,
        entity_type, entity_id, created_at
      )
      VALUES (
        v_audit_id, p_shop_id, v_user.id, 'PRICE_OVERRIDE',
        'Price override on ' || (v_c->>'product_name') || ' for sale ' || v_receipt_no,
        'Sale', v_sale_id, v_now
      );

      v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
        'id', v_audit_id,
        'shopId', p_shop_id,
        'actorId', v_user.id,
        'actionType', 'PRICE_OVERRIDE',
        'message', 'Price override on ' || (v_c->>'product_name') || ' for sale ' || v_receipt_no,
        'entityType', 'Sale',
        'entityId', v_sale_id,
        'createdAt', v_now
      ));
    END IF;

    IF v_so_by IS NOT NULL THEN
      v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

      INSERT INTO audit_logs (
        id, shop_id, actor_id, action_type, message,
        entity_type, entity_id, created_at
      )
      VALUES (
        v_audit_id, p_shop_id, v_user.id, 'STOCK_OVERRIDE',
        'Sold ' || (v_c->>'product_name') || ' below available stock for sale ' || v_receipt_no,
        'Sale', v_sale_id, v_now
      );

      v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
        'id', v_audit_id,
        'shopId', p_shop_id,
        'actorId', v_user.id,
        'actionType', 'STOCK_OVERRIDE',
        'message', 'Sold ' || (v_c->>'product_name') || ' below available stock for sale ' || v_receipt_no,
        'entityType', 'Sale',
        'entityId', v_sale_id,
        'createdAt', v_now
      ));
    END IF;
  END LOOP;

  -- 15. Sale-completed audit.
  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, p_shop_id, v_user.id, 'SALE_COMPLETED',
    'Completed sale ' || v_receipt_no || ' - total ' || v_total || ' MMK',
    'Sale', v_sale_id, v_now
  );

  v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', p_shop_id,
    'actorId', v_user.id,
    'actionType', 'SALE_COMPLETED',
    'message', 'Completed sale ' || v_receipt_no || ' - total ' || v_total || ' MMK',
    'entityType', 'Sale',
    'entityId', v_sale_id,
    'createdAt', v_now
  ));

  -- 16. Return everything the client needs to reconcile and print.
  RETURN jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_sale_id,
      'shopId', p_shop_id,
      'shiftId', p_shift_id,
      'receiptNo', v_receipt_no,
      'cashierId', v_user.id,
      'status', 'NORMAL',
      'subtotalMmk', v_subtotal,
      'discountMmk', v_discount,
      'cartDiscountPct', COALESCE(p_cart_discount_pct, 0),
      'totalMmk', v_total,
      'paymentMethod', p_payment_method,
      'paidMmk', p_paid_mmk,
      'changeMmk', v_change,
      'createdAt', v_now
    ),
    'items', v_items_out,
    'movements', v_moves_out,
    'inventory', v_inv_out,
    'auditLogs', v_audit_out,
    'shopName', v_shop.name,
    'cashierName', v_user.name
  );
END;
$$;

REVOKE ALL ON FUNCTION complete_sale(text, text, text, integer, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_sale(text, text, text, integer, numeric, jsonb) TO authenticated;
