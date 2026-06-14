-- ============================================================
-- Migration 041: capture cost-of-goods on each sale line
--
-- sale_items did not store the product cost at sale time, so profit/COGS had to
-- approximate with the CURRENT products.cost_mmk — which drifts whenever a cost
-- is edited later. This adds sale_items.unit_cost_mmk_snapshot and has
-- complete_sale stamp the product's base-unit cost (per base unit, matching
-- qty_units) onto every line at checkout. Reports prefer the snapshot and fall
-- back to current cost for legacy rows.
--
-- The function body is migration 034's complete_sale verbatim plus exactly
-- three additions (the captured cost in the computed line, the sale_items
-- INSERT, and the returned items). Everything else is unchanged.
--
-- Idempotent. Run AFTER 001-040.
-- ============================================================

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS unit_cost_mmk_snapshot integer;

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
  v_auth_uid          uuid := auth.uid();
  v_user              users;
  v_shop              shops;
  v_sale_id           text := 'sale-' || replace(gen_random_uuid()::text, '-', '');
  v_now               timestamptz := now();
  v_receipt_no        text;
  v_seq               integer;
  v_can_ovr_stock     boolean;
  v_can_ovr_price     boolean;
  v_default_level     price_levels;

  v_item              jsonb;
  v_product           products;
  v_unit              product_units;
  v_product_unit_id   text;
  v_qty               integer;
  v_base_qty_sold     integer;
  v_unit_price        integer;
  v_item_disc         numeric;
  v_line_total        integer;
  v_qty_before        integer;
  v_qty_after         integer;
  v_price_ovr         boolean;
  v_expected_price    integer;
  v_line_key          text;

  v_requested_level_id text;
  v_level             price_levels;
  v_resolved_level_id text;
  v_resolved_level_nm text;
  v_resolved_source   text;

  v_is_open_price     boolean;
  v_is_non_stock      boolean;
  v_client_price_raw  text;

  v_subtotal          integer := 0;
  v_after_disc        integer := 0;
  v_cart_disc         integer;
  v_total             integer;
  v_discount          integer;
  v_change            integer;

  v_computed          jsonb := '[]'::jsonb;
  v_c                 jsonb;

  -- Running on-hand per product across the cart lines (migration 034).
  v_stock_running     jsonb := '{}'::jsonb;

  v_items_out         jsonb := '[]'::jsonb;
  v_moves_out         jsonb := '[]'::jsonb;
  v_inv_out           jsonb := '[]'::jsonb;
  v_audit_out         jsonb := '[]'::jsonb;

  v_sale_item_id      text;
  v_move_id           text;
  v_audit_id          text;
  v_po_by             text;
  v_so_by             text;
BEGIN
  IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT app_has_perm('pos:create_sale') THEN
    RAISE EXCEPTION 'You are not permitted to create sales';
  END IF;
  IF NOT app_can_for_shop('pos:create_sale', p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to create sales in this shop';
  END IF;

  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN RAISE EXCEPTION 'Shop is required'; END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' THEN RAISE EXCEPTION 'Open shift is required'; END IF;
  IF p_payment_method NOT IN ('CASH', 'OTHER') THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;
  IF p_paid_mmk IS NULL OR p_paid_mmk < 0 THEN RAISE EXCEPTION 'Paid amount must be zero or greater'; END IF;
  IF COALESCE(p_cart_discount_pct, 0) < 0 OR COALESCE(p_cart_discount_pct, 0) > 100 THEN
    RAISE EXCEPTION 'Cart discount must be between 0 and 100';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) e WHERE COALESCE(e->>'product_id', '') = ''
  ) THEN
    RAISE EXCEPTION 'Product is required for every sale item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('complete_sale:' || p_shop_id));

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id;
  IF v_shop.id IS NULL THEN RAISE EXCEPTION 'Shop not found'; END IF;

  PERFORM 1 FROM shifts WHERE id = p_shift_id AND shop_id = p_shop_id
    AND cashier_id = v_user.id AND ended_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open shift for this cashier and shop'; END IF;

  v_can_ovr_stock := app_has_perm('pos:override_stock');
  v_can_ovr_price := app_has_perm('pos:override_price');

  SELECT * INTO v_default_level FROM price_levels
   WHERE is_default = true AND is_active = true LIMIT 1;

  SELECT count(*) INTO v_seq FROM sales
   WHERE shop_id = p_shop_id AND created_at::date = v_now::date;
  v_receipt_no := v_shop.code || '-' || to_char(v_now, 'YYYYMMDD')
                  || '-' || lpad((v_seq + 1)::text, 4, '0');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value)
  LOOP
    SELECT * INTO v_product FROM products
     WHERE id = (v_item->>'product_id') AND is_active = true;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found or inactive: %', (v_item->>'product_id');
    END IF;

    v_is_open_price := COALESCE(v_product.is_open_price, false);
    v_is_non_stock  := COALESCE(v_product.is_non_stock, false);

    v_product_unit_id := NULLIF(v_item->>'product_unit_id', '');
    IF v_product_unit_id IS NULL THEN
      SELECT * INTO v_unit FROM product_units
       WHERE product_id = v_product.id AND is_active = true AND is_default = true LIMIT 1;
    ELSE
      SELECT * INTO v_unit FROM product_units
       WHERE id = v_product_unit_id AND product_id = v_product.id AND is_active = true;
    END IF;
    IF v_unit.id IS NULL THEN
      RAISE EXCEPTION 'Sellable unit not found or inactive for %', v_product.name;
    END IF;

    v_requested_level_id := NULLIF(v_item->>'price_level_id', '');
    IF v_requested_level_id IS NULL THEN
      v_level := v_default_level;
    ELSE
      SELECT * INTO v_level FROM price_levels
       WHERE id = v_requested_level_id AND is_active = true;
      IF v_level.id IS NULL THEN
        RAISE EXCEPTION 'Price level % is not active', v_requested_level_id;
      END IF;
    END IF;
    IF v_level.id IS NULL THEN
      RAISE EXCEPTION 'No active price level available';
    END IF;

    v_resolved_level_id := v_level.id;
    v_resolved_level_nm := v_level.name;
    v_expected_price    := NULL;
    v_resolved_source   := NULL;
    v_price_ovr         := false;

    IF v_is_open_price THEN
      v_client_price_raw := NULLIF(v_item->>'unit_price_mmk', '');
      IF v_client_price_raw IS NULL THEN
        RAISE EXCEPTION 'Open Price item % requires a unit price', v_product.name;
      END IF;
      v_unit_price := v_client_price_raw::integer;
      IF v_unit_price <= 0 THEN
        RAISE EXCEPTION 'Open Price for % must be greater than 0', v_product.name;
      END IF;
      v_resolved_source := 'open_price';
      v_expected_price  := v_unit_price;

    ELSE
      SELECT price_mmk INTO v_expected_price FROM product_unit_prices
       WHERE product_unit_id = v_unit.id AND price_level_id = v_level.id
         AND shop_id = p_shop_id AND is_active = true LIMIT 1;
      IF v_expected_price IS NOT NULL THEN
        v_resolved_source := 'shop_override';
      ELSE
        SELECT price_mmk INTO v_expected_price FROM product_unit_prices
         WHERE product_unit_id = v_unit.id AND price_level_id = v_level.id
           AND shop_id IS NULL AND is_active = true LIMIT 1;
        IF v_expected_price IS NOT NULL THEN
          v_resolved_source := 'global_price_level';
        END IF;
      END IF;

      IF v_expected_price IS NULL AND v_default_level.id IS NOT NULL AND v_level.id <> v_default_level.id THEN
        SELECT price_mmk INTO v_expected_price FROM product_unit_prices
         WHERE product_unit_id = v_unit.id AND price_level_id = v_default_level.id
           AND shop_id = p_shop_id AND is_active = true LIMIT 1;
        IF v_expected_price IS NOT NULL THEN
          v_resolved_level_id := v_default_level.id;
          v_resolved_level_nm := v_default_level.name;
          v_resolved_source   := 'retail_fallback_shop';
        ELSE
          SELECT price_mmk INTO v_expected_price FROM product_unit_prices
           WHERE product_unit_id = v_unit.id AND price_level_id = v_default_level.id
             AND shop_id IS NULL AND is_active = true LIMIT 1;
          IF v_expected_price IS NOT NULL THEN
            v_resolved_level_id := v_default_level.id;
            v_resolved_level_nm := v_default_level.name;
            v_resolved_source   := 'retail_fallback_global';
          END IF;
        END IF;
      END IF;

      IF v_expected_price IS NULL THEN
        v_expected_price  := v_unit.sale_price_mmk;
        v_resolved_source := 'legacy_sale_price';
      END IF;

      IF v_expected_price IS NULL THEN
        RAISE EXCEPTION 'No active price configured for %', v_product.name;
      END IF;

      v_unit_price := v_expected_price;
    END IF;

    IF v_is_open_price THEN
      v_line_key := v_product.id || ':' || v_unit.id || ':' || v_resolved_level_id
                   || ':open:' || replace(gen_random_uuid()::text, '-', '');
    ELSE
      v_line_key := v_product.id || ':' || v_unit.id || ':' || v_resolved_level_id;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_computed) e WHERE e->>'line_key' = v_line_key) THEN
      RAISE EXCEPTION 'A product unit + price level appears more than once in the cart; combine the lines';
    END IF;

    v_qty := NULLIF(v_item->>'qty', '')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for %', v_product.name;
    END IF;
    v_base_qty_sold := v_qty * v_unit.base_quantity;

    IF NOT v_is_open_price
       AND v_unit.is_default
       AND v_resolved_level_id = COALESCE(v_default_level.id, '') THEN
      SELECT pt.price_mmk INTO v_unit_price FROM price_tiers pt
       WHERE pt.product_id = v_product.id AND pt.is_active = true
         AND (pt.shop_id = p_shop_id OR pt.shop_id IS NULL)
         AND v_base_qty_sold >= pt.min_qty
         AND (pt.max_qty IS NULL OR v_base_qty_sold <= pt.max_qty)
       ORDER BY CASE WHEN pt.shop_id = p_shop_id THEN 0 ELSE 1 END, pt.min_qty DESC LIMIT 1;
      v_unit_price := COALESCE(v_unit_price, v_expected_price);
    END IF;

    IF NOT v_is_open_price
       AND v_item ? 'unit_price_mmk'
       AND NULLIF(v_item->>'unit_price_mmk', '') IS NOT NULL THEN
      DECLARE v_client_price integer := (v_item->>'unit_price_mmk')::integer;
      BEGIN
        IF v_client_price < 0 THEN RAISE EXCEPTION 'Invalid unit price for %', v_product.name; END IF;
        IF v_client_price <> v_unit_price THEN
          IF NOT v_can_ovr_price THEN
            RAISE EXCEPTION 'You are not permitted to override prices';
          END IF;
          v_unit_price := v_client_price;
          v_resolved_source := 'manual_override';
        END IF;
      END;
    END IF;

    v_price_ovr := (v_resolved_source = 'manual_override');

    v_item_disc := COALESCE(NULLIF(v_item->>'item_discount_pct', '')::numeric, 0);
    IF v_item_disc < 0 OR v_item_disc > 100 THEN
      RAISE EXCEPTION 'Item discount must be between 0 and 100 for %', v_product.name;
    END IF;

    -- ------------------------------------------------------------------
    -- Inventory branch. Non-stock products skip the whole chain. For
    -- stock-tracked products we keep a per-product running on-hand value
    -- (`v_stock_running`) so multiple lines for the same product deduct
    -- cumulatively instead of all reading the same starting stock — the
    -- migration 034 fix. The first line per product reads + locks the
    -- inventory row; later lines start from the prior line's result.
    -- ------------------------------------------------------------------
    IF v_is_non_stock THEN
      v_qty_before := NULL;
      v_qty_after  := NULL;
    ELSE
      IF v_stock_running ? v_product.id THEN
        v_qty_before := (v_stock_running ->> v_product.id)::integer;
      ELSE
        SELECT qty_base_units INTO v_qty_before FROM inventory
         WHERE shop_id = p_shop_id AND product_id = v_product.id FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Inventory row not found for % in %', v_product.name, v_shop.name;
        END IF;
      END IF;

      v_qty_after := v_qty_before - v_base_qty_sold;
      IF v_qty_after < 0 AND NOT v_can_ovr_stock THEN
        RAISE EXCEPTION 'Insufficient stock for %: have %, need %',
          v_product.name, v_qty_before, v_base_qty_sold;
      END IF;

      v_stock_running := jsonb_set(v_stock_running, ARRAY[v_product.id], to_jsonb(v_qty_after));
    END IF;

    v_line_total := round(v_qty * v_unit_price * (1 - v_item_disc / 100))::integer;
    v_subtotal   := v_subtotal + (v_unit_price * v_qty);
    v_after_disc := v_after_disc + v_line_total;

    v_computed := v_computed || jsonb_build_array(jsonb_build_object(
      'line_key',          v_line_key,
      'product_id',        v_product.id,
      'product_name',      v_product.name,
      'product_unit_id',   v_unit.id,
      'unit_name',         v_unit.name,
      'unit_base_qty',     v_unit.base_quantity,
      'qty',               v_qty,
      'base_qty_sold',     v_base_qty_sold,
      'unit_price',        v_unit_price,
      'unit_cost',         v_product.cost_mmk,   -- migration 041: COGS snapshot (per base unit)
      'item_discount',     v_item_disc,
      'line_total',        v_line_total,
      'qty_before',        v_qty_before,
      'qty_after',         v_qty_after,
      'price_ovr',         v_price_ovr,
      'stock_ovr',         CASE WHEN v_is_non_stock THEN false ELSE (v_qty_after < 0) END,
      'is_non_stock',      v_is_non_stock,
      'is_open_price',     v_is_open_price,
      'price_level_id',    v_resolved_level_id,
      'price_level_name',  v_resolved_level_nm,
      'price_source',      v_resolved_source
    ));
  END LOOP;

  v_cart_disc := round(v_after_disc * COALESCE(p_cart_discount_pct, 0) / 100)::integer;
  v_total     := greatest(0, v_after_disc - v_cart_disc);
  v_discount  := v_subtotal - v_total;
  v_change    := greatest(0, p_paid_mmk - v_total);
  IF p_paid_mmk < v_total THEN RAISE EXCEPTION 'Paid amount is less than the sale total'; END IF;

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

  FOR v_c IN SELECT value FROM jsonb_array_elements(v_computed) AS t(value)
  LOOP
    v_po_by := CASE WHEN (v_c->>'price_ovr')::boolean THEN v_user.id ELSE NULL END;
    v_so_by := CASE WHEN (v_c->>'stock_ovr')::boolean THEN v_user.id ELSE NULL END;
    v_sale_item_id := 'item-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO sale_items (
      id, sale_id, product_id, product_unit_id, qty_units, unit_price_mmk,
      item_discount_pct, line_total_mmk, price_overridden_by,
      unit_label, units_per_item, unit_name_snapshot,
      unit_base_quantity_snapshot, unit_price_mmk_snapshot,
      base_quantity_sold, stock_override_by,
      price_level_id, price_level_name_snapshot, price_source_snapshot,
      unit_cost_mmk_snapshot
    )
    VALUES (
      v_sale_item_id, v_sale_id, v_c->>'product_id', v_c->>'product_unit_id',
      (v_c->>'base_qty_sold')::integer, (v_c->>'unit_price')::integer,
      NULLIF((v_c->>'item_discount')::numeric, 0),
      (v_c->>'line_total')::integer, v_po_by,
      v_c->>'unit_name', (v_c->>'unit_base_qty')::integer,
      v_c->>'unit_name', (v_c->>'unit_base_qty')::integer,
      (v_c->>'unit_price')::integer, (v_c->>'base_qty_sold')::integer,
      v_so_by,
      v_c->>'price_level_id', v_c->>'price_level_name', v_c->>'price_source',
      (v_c->>'unit_cost')::integer
    );

    IF NOT (v_c->>'is_non_stock')::boolean THEN
      UPDATE inventory SET qty_base_units = (v_c->>'qty_after')::integer
       WHERE shop_id = p_shop_id AND product_id = v_c->>'product_id';

      v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO inventory_movements (
        id, shop_id, product_id, type, qty_change,
        qty_before, qty_after, reason, reference_type, reference_id,
        created_by, created_at,
        product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot,
        selected_unit_quantity
      )
      VALUES (
        v_move_id, p_shop_id, v_c->>'product_id', 'SALE_OUT',
        -(v_c->>'base_qty_sold')::integer, (v_c->>'qty_before')::integer,
        (v_c->>'qty_after')::integer, 'Sale ' || v_receipt_no,
        'sale', v_sale_id, v_user.id, v_now,
        v_c->>'product_unit_id', v_c->>'unit_name',
        (v_c->>'unit_base_qty')::integer, (v_c->>'qty')::integer
      );

      v_moves_out := v_moves_out || jsonb_build_array(jsonb_build_object(
        'id', v_move_id,
        'shopId', p_shop_id,
        'productId', v_c->>'product_id',
        'type', 'SALE_OUT',
        'qtyChange', -(v_c->>'base_qty_sold')::integer,
        'qtyBefore', (v_c->>'qty_before')::integer,
        'qtyAfter', (v_c->>'qty_after')::integer,
        'reason', 'Sale ' || v_receipt_no,
        'referenceType', 'sale',
        'referenceId', v_sale_id,
        'createdBy', v_user.id,
        'createdAt', v_now,
        'productUnitId', v_c->>'product_unit_id',
        'unitNameSnapshot', v_c->>'unit_name',
        'unitBaseQuantitySnapshot', (v_c->>'unit_base_qty')::integer,
        'selectedUnitQuantity', (v_c->>'qty')::integer
      ));

      v_inv_out := v_inv_out || jsonb_build_array(jsonb_build_object(
        'shopId', p_shop_id,
        'productId', v_c->>'product_id',
        'qtyBaseUnits', (v_c->>'qty_after')::integer
      ));
    END IF;

    v_items_out := v_items_out || jsonb_build_array(jsonb_build_object(
      'id', v_sale_item_id,
      'saleId', v_sale_id,
      'productId', v_c->>'product_id',
      'productUnitId', v_c->>'product_unit_id',
      'qtyUnits', (v_c->>'base_qty_sold')::integer,
      'unitPriceMmk', (v_c->>'unit_price')::integer,
      'itemDiscountPct', NULLIF((v_c->>'item_discount')::numeric, 0),
      'lineTotalMmk', (v_c->>'line_total')::integer,
      'priceOverriddenBy', v_po_by,
      'unitLabel', v_c->>'unit_name',
      'unitsPerItem', (v_c->>'unit_base_qty')::integer,
      'unitNameSnapshot', v_c->>'unit_name',
      'unitBaseQuantitySnapshot', (v_c->>'unit_base_qty')::integer,
      'unitPriceMmkSnapshot', (v_c->>'unit_price')::integer,
      'baseQuantitySold', (v_c->>'base_qty_sold')::integer,
      'unitCostMmkSnapshot', (v_c->>'unit_cost')::integer,
      'stockOverrideBy', v_so_by,
      'priceLevelId', v_c->>'price_level_id',
      'priceLevelNameSnapshot', v_c->>'price_level_name',
      'priceSourceSnapshot', v_c->>'price_source'
    ));

    IF v_po_by IS NOT NULL THEN
      v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message,
        entity_type, entity_id, created_at)
      VALUES (v_audit_id, p_shop_id, v_user.id, 'PRICE_OVERRIDE',
        'Price override on ' || (v_c->>'product_name') || ' for sale ' || v_receipt_no,
        'Sale', v_sale_id, v_now);
      v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
        'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id,
        'actionType', 'PRICE_OVERRIDE',
        'message', 'Price override on ' || (v_c->>'product_name') || ' for sale ' || v_receipt_no,
        'entityType', 'Sale', 'entityId', v_sale_id, 'createdAt', v_now));
    END IF;

    IF v_so_by IS NOT NULL THEN
      v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
      INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message,
        entity_type, entity_id, created_at)
      VALUES (v_audit_id, p_shop_id, v_user.id, 'STOCK_OVERRIDE',
        'Sold ' || (v_c->>'product_name') || ' below available stock for sale ' || v_receipt_no,
        'Sale', v_sale_id, v_now);
      v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
        'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id,
        'actionType', 'STOCK_OVERRIDE',
        'message', 'Sold ' || (v_c->>'product_name') || ' below available stock for sale ' || v_receipt_no,
        'entityType', 'Sale', 'entityId', v_sale_id, 'createdAt', v_now));
    END IF;
  END LOOP;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO audit_logs (id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at)
  VALUES (v_audit_id, p_shop_id, v_user.id, 'SALE_COMPLETED',
    'Completed sale ' || v_receipt_no || ' - total ' || v_total || ' MMK',
    'Sale', v_sale_id, v_now);
  v_audit_out := v_audit_out || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id,
    'actionType', 'SALE_COMPLETED',
    'message', 'Completed sale ' || v_receipt_no || ' - total ' || v_total || ' MMK',
    'entityType', 'Sale', 'entityId', v_sale_id, 'createdAt', v_now));

  RETURN jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_sale_id, 'shopId', p_shop_id, 'shiftId', p_shift_id,
      'receiptNo', v_receipt_no, 'cashierId', v_user.id, 'status', 'NORMAL',
      'subtotalMmk', v_subtotal, 'discountMmk', v_discount,
      'cartDiscountPct', COALESCE(p_cart_discount_pct, 0),
      'totalMmk', v_total, 'paymentMethod', p_payment_method,
      'paidMmk', p_paid_mmk, 'changeMmk', v_change, 'createdAt', v_now),
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
