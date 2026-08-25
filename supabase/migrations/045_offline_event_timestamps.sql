-- ============================================================
-- Migration 045: preserve the real event time for offline-queued writes
--
-- Every offline-eligible RPC (complete_sale, adjust_stock,
-- receive_purchase_order, dispatch_stock_transfer, receive_stock_transfer,
-- open_shift, close_shift, record_supplier_payment,
-- create_refund_void_request) stamped its row with the SERVER's now() —
-- which, for a write that was queued in the client's offline outbox and
-- only actually executes once the device reconnects, is the SYNC time,
-- not when the action really happened. A sale rung up offline at 3pm that
-- doesn't sync until 9pm showed up in reports, receipt numbering, and
-- shift reconciliation as a 9pm sale.
--
-- Each RPC gains an optional p_created_at timestamptz param. The client
-- (src/stores/data/outbox.ts et al.) now passes the moment the action was
-- actually taken — the same value already used for the local/offline
-- provisional record — for both the immediate-online and queued-offline
-- paths, so behavior is identical either way. resolve_event_time() below
-- is the single place that decides whether to trust it: NULL (older
-- clients, or a caller that doesn't send one) falls back to real now(),
-- and anything outside a sane bound (more than 5 minutes in the future —
-- clock-skew tolerance only, or more than 48 hours in the past — double
-- the 24h offline-session/outbox-stuck-entry window) is also rejected in
-- favor of server time, so a compromised or misconfigured client can't
-- arbitrarily backdate financial/inventory records.
--
-- Every one of these functions already used a single `v_now` variable for
-- every timestamp it writes (created_at, receipt-number day bucketing,
-- audit log entries, etc.) — so swapping its source is the only change;
-- the rest of each function body is byte-for-byte unchanged from its
-- current live definition (verified via `diff` against the extracted
-- live source before assembly, not retyped by hand). Each function's own
-- signature-changing DROP + fresh REVOKE/GRANT is scoped to only that
-- function — deliberately NOT re-running the various source migrations'
-- own combined/multi-function trailing grant blocks, since those target
-- now-dropped old signatures and would error.
--
-- Idempotent. Run AFTER 001-044.
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_event_time(p_client_time timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_client_time IS NULL THEN
    RETURN now();
  END IF;
  IF p_client_time > now() + interval '5 minutes'
     OR p_client_time < now() - interval '48 hours' THEN
    RETURN now();
  END IF;
  RETURN p_client_time;
END;
$$;

-- ============================================================
-- complete_sale
-- ============================================================
DROP FUNCTION IF EXISTS complete_sale(text, text, text, integer, numeric, jsonb);

CREATE OR REPLACE FUNCTION complete_sale(
  p_shop_id            text,
  p_shift_id           text,
  p_payment_method     text,
  p_paid_mmk           integer,
  p_cart_discount_pct  numeric,
  p_items              jsonb,
  p_created_at         timestamptz DEFAULT NULL
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
  v_now               timestamptz := resolve_event_time(p_created_at);
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

REVOKE ALL ON FUNCTION complete_sale(text, text, text, integer, numeric, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_sale(text, text, text, integer, numeric, jsonb, timestamptz) TO authenticated;

-- ============================================================
-- adjust_stock
-- ============================================================
DROP FUNCTION IF EXISTS adjust_stock(text, text, text, integer, text, text, integer);

CREATE OR REPLACE FUNCTION adjust_stock(
  p_shop_id         text,
  p_product_id      text,
  p_adjustment_type text,
  p_quantity_delta  integer,
  p_reason          text,
  p_product_unit_id text DEFAULT NULL,
  p_unit_qty        integer DEFAULT NULL,
  p_created_at      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid    uuid := auth.uid();
  v_user        users;
  v_now         timestamptz := resolve_event_time(p_created_at);
  v_perm        text;
  v_ref_type    text;
  v_qty_before  integer;
  v_qty_after   integer;
  v_move_id     text;
  v_audit_id    text;
  v_message     text;
  v_unit        product_units;
  v_sign        integer;
  v_delta       integer;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_adjustment_type NOT IN ('ADJUSTMENT', 'DAMAGE', 'PURCHASE_IN', 'RETURN_IN') THEN
    RAISE EXCEPTION 'Unsupported adjustment type: %', p_adjustment_type;
  END IF;

  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;
  IF p_product_id IS NULL OR btrim(p_product_id) = '' THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Quantity change cannot be zero';
  END IF;

  -- Resolve the unit-aware delta when the caller picked a unit.
  -- Sign comes from p_quantity_delta; magnitude comes from p_unit_qty *
  -- unit.base_quantity. This keeps the sign semantics shared with the
  -- legacy path (DAMAGE → negative, PURCHASE_IN/RETURN_IN → positive,
  -- ADJUSTMENT → either) without doubling the parameter list.
  IF p_product_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit
      FROM product_units
     WHERE id = p_product_unit_id
       AND product_id = p_product_id
       AND is_active = true;
    IF v_unit.id IS NULL THEN
      RAISE EXCEPTION 'Sellable unit % is not active for product %', p_product_unit_id, p_product_id;
    END IF;
    IF p_unit_qty IS NULL OR p_unit_qty <= 0 THEN
      RAISE EXCEPTION 'Unit qty must be greater than zero when a sellable unit is selected';
    END IF;
    v_sign  := CASE WHEN p_quantity_delta < 0 THEN -1 ELSE 1 END;
    v_delta := v_sign * (p_unit_qty * v_unit.base_quantity);
  ELSE
    v_delta := p_quantity_delta;
  END IF;

  IF p_adjustment_type = 'DAMAGE' AND v_delta > 0 THEN
    RAISE EXCEPTION 'Damage write-off must reduce stock';
  END IF;
  IF p_adjustment_type IN ('PURCHASE_IN', 'RETURN_IN') AND v_delta < 0 THEN
    RAISE EXCEPTION 'Stock-in adjustments must increase stock';
  END IF;

  v_perm := CASE WHEN p_adjustment_type = 'DAMAGE'
                 THEN 'inventory:damage' ELSE 'inventory:adjust' END;

  IF NOT app_has_perm(v_perm) THEN
    RAISE EXCEPTION 'You are not permitted to make this inventory adjustment';
  END IF;
  IF NOT app_can_for_shop(v_perm, p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to adjust inventory in this shop';
  END IF;

  PERFORM 1 FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  INSERT INTO inventory (shop_id, product_id, qty_base_units)
  VALUES (p_shop_id, p_product_id, 0)
  ON CONFLICT (shop_id, product_id) DO NOTHING;

  SELECT qty_base_units INTO v_qty_before
    FROM inventory
   WHERE shop_id = p_shop_id AND product_id = p_product_id
   FOR UPDATE;

  v_qty_after := v_qty_before + v_delta;

  IF v_qty_after < 0 AND NOT app_has_perm('pos:override_stock') THEN
    RAISE EXCEPTION 'Adjustment would drive stock negative (% to %)',
      v_qty_before, v_qty_after;
  END IF;

  UPDATE inventory SET qty_base_units = v_qty_after
   WHERE shop_id = p_shop_id AND product_id = p_product_id;

  v_ref_type := CASE WHEN p_adjustment_type = 'DAMAGE' THEN 'damage' ELSE 'adjustment' END;
  v_move_id  := 'move-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO inventory_movements (
    id, shop_id, product_id, type, qty_change,
    qty_before, qty_after, reason, reference_type, reference_id,
    created_by, created_at,
    product_unit_id, unit_name_snapshot, unit_base_quantity_snapshot,
    selected_unit_quantity
  )
  VALUES (
    v_move_id, p_shop_id, p_product_id, p_adjustment_type, v_delta,
    v_qty_before, v_qty_after, p_reason, v_ref_type, NULL,
    v_user.id, v_now,
    v_unit.id, v_unit.name, v_unit.base_quantity, p_unit_qty
  );

  v_message := 'Stock ' || p_adjustment_type || ': ' || v_delta
    || ' (from ' || v_qty_before || ' to ' || v_qty_after || '). ' || p_reason;
  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, p_shop_id, v_user.id, 'STOCK_' || p_adjustment_type, v_message,
    'Inventory', p_product_id, v_now
  );

  RETURN jsonb_build_object(
    'inventory', jsonb_build_object(
      'shopId', p_shop_id, 'productId', p_product_id, 'qtyBaseUnits', v_qty_after
    ),
    'movement', jsonb_build_object(
      'id', v_move_id, 'shopId', p_shop_id, 'productId', p_product_id,
      'type', p_adjustment_type, 'qtyChange', v_delta,
      'qtyBefore', v_qty_before, 'qtyAfter', v_qty_after,
      'reason', p_reason, 'referenceType', v_ref_type, 'referenceId', NULL,
      'createdBy', v_user.id, 'createdAt', v_now,
      'productUnitId', v_unit.id,
      'unitNameSnapshot', v_unit.name,
      'unitBaseQuantitySnapshot', v_unit.base_quantity,
      'selectedUnitQuantity', p_unit_qty
    ),
    'auditLog', jsonb_build_object(
      'id', v_audit_id, 'shopId', p_shop_id, 'actorId', v_user.id,
      'actionType', 'STOCK_' || p_adjustment_type, 'message', v_message,
      'entityType', 'Inventory', 'entityId', p_product_id, 'createdAt', v_now
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION adjust_stock(text, text, text, integer, text, text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_stock(text, text, text, integer, text, text, integer, timestamptz) TO authenticated;

-- ============================================================
-- receive_purchase_order
-- ============================================================
DROP FUNCTION IF EXISTS receive_purchase_order(text, jsonb);

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_purchase_order_id text,
  p_received_items    jsonb DEFAULT NULL,
  p_created_at        timestamptz DEFAULT NULL
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
  v_now               timestamptz := resolve_event_time(p_created_at);
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

REVOKE ALL ON FUNCTION receive_purchase_order(text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_purchase_order(text, jsonb, timestamptz) TO authenticated;

-- ============================================================
-- dispatch_stock_transfer
-- ============================================================
DROP FUNCTION IF EXISTS dispatch_stock_transfer(text);

CREATE OR REPLACE FUNCTION dispatch_stock_transfer(p_transfer_id text, p_created_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_t stock_transfers; v_now timestamptz := resolve_event_time(p_created_at);
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

REVOKE ALL ON FUNCTION dispatch_stock_transfer(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dispatch_stock_transfer(text, timestamptz) TO authenticated;

-- ============================================================
-- receive_stock_transfer
-- ============================================================
DROP FUNCTION IF EXISTS receive_stock_transfer(text, jsonb);

CREATE OR REPLACE FUNCTION receive_stock_transfer(
  p_transfer_id    text,
  p_received_items jsonb DEFAULT NULL,
  p_created_at     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user        users;
  v_transfer    stock_transfers;
  v_now         timestamptz := resolve_event_time(p_created_at);
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

REVOKE ALL ON FUNCTION receive_stock_transfer(text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION receive_stock_transfer(text, jsonb, timestamptz) TO authenticated;

-- ============================================================
-- open_shift
-- ============================================================
DROP FUNCTION IF EXISTS open_shift(text, integer);

CREATE OR REPLACE FUNCTION open_shift(
  p_shop_id text,
  p_opening_cash_mmk integer
  ,p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid   uuid := auth.uid();
  v_user       users;
  v_shop       shops;
  v_shift      shifts;
  v_shift_id   text := 'shift-' || replace(gen_random_uuid()::text, '-', '');
  v_now        timestamptz := resolve_event_time(p_created_at);
  v_audit_id   text;
  v_audit_logs jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_shop_id IS NULL OR btrim(p_shop_id) = '' THEN
    RAISE EXCEPTION 'Shop is required';
  END IF;

  IF p_opening_cash_mmk IS NULL OR p_opening_cash_mmk < 0 THEN
    RAISE EXCEPTION 'Opening cash must be zero or greater';
  END IF;

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id AND is_active = true;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'Shop not found or inactive';
  END IF;

  IF NOT (
    app_can_for_shop('shift:manage_own', p_shop_id)
    OR app_can_for_shop('shift:manage_all', p_shop_id)
  ) THEN
    RAISE EXCEPTION 'You are not permitted to open shifts in this shop';
  END IF;

  -- Serialize open attempts for this cashier so the global-open-shift rule is
  -- reliable even across different shops.
  PERFORM pg_advisory_xact_lock(hashtext('open_shift:' || v_user.id));

  IF EXISTS (
    SELECT 1
      FROM shifts
     WHERE cashier_id = v_user.id AND ended_at IS NULL
     FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'This cashier already has an open shift';
  END IF;

  INSERT INTO shifts (
    id, shop_id, cashier_id, started_at, opening_cash_mmk
  )
  VALUES (
    v_shift_id, p_shop_id, v_user.id, v_now, p_opening_cash_mmk
  )
  RETURNING * INTO v_shift;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, p_shop_id, v_user.id, 'SHIFT_OPENED',
    'Opened shift with opening cash ' || p_opening_cash_mmk || ' MMK',
    'Shift', v_shift.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', p_shop_id,
    'actorId', v_user.id,
    'actionType', 'SHIFT_OPENED',
    'message', 'Opened shift with opening cash ' || p_opening_cash_mmk || ' MMK',
    'entityType', 'Shift',
    'entityId', v_shift.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'shift', jsonb_build_object(
      'id', v_shift.id,
      'shopId', v_shift.shop_id,
      'cashierId', v_shift.cashier_id,
      'startedAt', v_shift.started_at,
      'endedAt', v_shift.ended_at,
      'openingCashMmk', v_shift.opening_cash_mmk,
      'closingCashMmk', v_shift.closing_cash_mmk,
      'expectedCashMmk', v_shift.expected_cash_mmk,
      'varianceMmk', v_shift.variance_mmk,
      'varianceReason', v_shift.variance_reason
    ),
    'auditLogs', v_audit_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION open_shift(text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION open_shift(text, integer, timestamptz) TO authenticated;

-- ============================================================
-- close_shift
-- ============================================================
DROP FUNCTION IF EXISTS close_shift(text, integer, text);

CREATE OR REPLACE FUNCTION close_shift(
  p_shift_id text,
  p_closing_cash_mmk integer,
  p_variance_reason text DEFAULT NULL
  ,p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_uid      uuid := auth.uid();
  v_user          users;
  v_shift         shifts;
  v_now           timestamptz := resolve_event_time(p_created_at);
  v_cash_sales    integer := 0;
  v_cash_refunds  integer := 0;
  v_expected_cash integer;
  v_variance      integer;
  v_audit_id      text;
  v_audit_logs    jsonb := '[]'::jsonb;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' THEN
    RAISE EXCEPTION 'Shift is required';
  END IF;

  IF p_closing_cash_mmk IS NULL OR p_closing_cash_mmk < 0 THEN
    RAISE EXCEPTION 'Closing cash must be zero or greater';
  END IF;

  SELECT * INTO v_shift
    FROM shifts
   WHERE id = p_shift_id
   FOR UPDATE;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;

  IF v_shift.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Shift is already closed';
  END IF;

  IF NOT (
    (v_shift.cashier_id = v_user.id AND app_can_for_shop('shift:manage_own', v_shift.shop_id))
    OR app_can_for_shop('shift:manage_all', v_shift.shop_id)
  ) THEN
    RAISE EXCEPTION 'You are not permitted to close this shift';
  END IF;

  SELECT COALESCE(sum(total_mmk), 0) INTO v_cash_sales
    FROM sales
   WHERE shift_id = v_shift.id
     AND payment_method = 'CASH'
     AND status <> 'VOID';

  SELECT COALESCE(sum((COALESCE(item->>'amountMmk', item->>'amount_mmk'))::integer), 0)
    INTO v_cash_refunds
    FROM refund_void_requests r
    JOIN sales s ON s.id = r.sale_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) item
   WHERE s.shift_id = v_shift.id
     AND s.payment_method = 'CASH'
     AND r.type = 'PARTIAL'
     AND r.status = 'APPROVED';

  v_expected_cash := v_shift.opening_cash_mmk + v_cash_sales - v_cash_refunds;
  v_variance := p_closing_cash_mmk - v_expected_cash;

  IF v_variance <> 0 AND COALESCE(btrim(p_variance_reason), '') = '' THEN
    RAISE EXCEPTION 'Variance reason is required when closing cash does not match expected cash';
  END IF;

  UPDATE shifts
     SET ended_at = v_now,
         closing_cash_mmk = p_closing_cash_mmk,
         expected_cash_mmk = v_expected_cash,
         variance_mmk = v_variance,
         variance_reason = NULLIF(btrim(p_variance_reason), '')
   WHERE id = v_shift.id
   RETURNING * INTO v_shift;

  v_audit_id := 'audit-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_shift.shop_id, v_user.id, 'SHIFT_CLOSED',
    'Closed shift. Expected cash ' || v_expected_cash || ' MMK, closing cash '
      || p_closing_cash_mmk || ' MMK, variance ' || v_variance || ' MMK',
    'Shift', v_shift.id, v_now
  );

  v_audit_logs := v_audit_logs || jsonb_build_array(jsonb_build_object(
    'id', v_audit_id,
    'shopId', v_shift.shop_id,
    'actorId', v_user.id,
    'actionType', 'SHIFT_CLOSED',
    'message', 'Closed shift. Expected cash ' || v_expected_cash || ' MMK, closing cash '
      || p_closing_cash_mmk || ' MMK, variance ' || v_variance || ' MMK',
    'entityType', 'Shift',
    'entityId', v_shift.id,
    'createdAt', v_now
  ));

  RETURN jsonb_build_object(
    'shift', jsonb_build_object(
      'id', v_shift.id,
      'shopId', v_shift.shop_id,
      'cashierId', v_shift.cashier_id,
      'startedAt', v_shift.started_at,
      'endedAt', v_shift.ended_at,
      'openingCashMmk', v_shift.opening_cash_mmk,
      'closingCashMmk', v_shift.closing_cash_mmk,
      'expectedCashMmk', v_shift.expected_cash_mmk,
      'varianceMmk', v_shift.variance_mmk,
      'varianceReason', v_shift.variance_reason
    ),
    'auditLogs', v_audit_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION close_shift(text, integer, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_shift(text, integer, text, timestamptz) TO authenticated;

-- ============================================================
-- record_supplier_payment
-- ============================================================
DROP FUNCTION IF EXISTS record_supplier_payment(text, integer, text, text, text);

CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_purchase_order_id text,
  p_amount_mmk integer,
  p_payment_method text,
  p_reference_no text DEFAULT NULL,
  p_notes text DEFAULT NULL
  ,p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users;
  v_po purchase_orders;
  v_payment supplier_payments;
  v_now timestamptz := resolve_event_time(p_created_at);
  v_outstanding integer;
  v_new_paid integer;
  v_new_status text;
  v_payment_id text := 'suppay-' || replace(gen_random_uuid()::text, '-', '');
  v_audit_id text := 'audit-' || replace(gen_random_uuid()::text, '-', '');
  v_method text := upper(COALESCE(NULLIF(btrim(p_payment_method), ''), ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_user := current_app_user();
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_purchase_order_id IS NULL OR btrim(p_purchase_order_id) = '' THEN
    RAISE EXCEPTION 'Purchase order is required';
  END IF;
  IF p_amount_mmk IS NULL OR p_amount_mmk <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;
  IF v_method NOT IN ('CASH', 'BANK', 'MOBILE', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported supplier payment method: %', p_payment_method;
  END IF;

  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_purchase_order_id
   FOR UPDATE;

  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF v_po.status <> 'RECEIVED' THEN
    RAISE EXCEPTION 'Supplier payments can only be recorded against received purchase orders';
  END IF;
  IF NOT app_can_for_shop('supplier:payment_create', v_po.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to record supplier payments for this shop';
  END IF;

  v_outstanding := v_po.total_mmk - COALESCE(v_po.paid_mmk, 0);
  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'Purchase order is already paid';
  END IF;
  IF p_amount_mmk > v_outstanding THEN
    RAISE EXCEPTION 'Payment amount exceeds outstanding balance';
  END IF;

  INSERT INTO supplier_payments (
    id, supplier_id, purchase_order_id, shop_id, amount_mmk,
    payment_method, reference_no, notes, paid_at, created_by, created_at
  )
  VALUES (
    v_payment_id, v_po.supplier_id, v_po.id, v_po.shop_id, p_amount_mmk,
    v_method, NULLIF(btrim(p_reference_no), ''), NULLIF(btrim(p_notes), ''),
    v_now, v_user.id, v_now
  )
  RETURNING * INTO v_payment;

  v_new_paid := COALESCE(v_po.paid_mmk, 0) + p_amount_mmk;
  v_new_status := CASE
    WHEN v_new_paid >= v_po.total_mmk THEN 'PAID'
    WHEN v_new_paid > 0 THEN 'PARTIAL'
    ELSE 'UNPAID'
  END;

  UPDATE purchase_orders
     SET paid_mmk = v_new_paid,
         payment_status = v_new_status
   WHERE id = v_po.id
   RETURNING * INTO v_po;

  INSERT INTO audit_logs (
    id, shop_id, actor_id, action_type, message,
    entity_type, entity_id, created_at
  )
  VALUES (
    v_audit_id, v_po.shop_id, v_user.id, 'SUPPLIER_PAYMENT_RECORDED',
    'Supplier payment recorded for ' || v_po.order_no || ': MMK ' || p_amount_mmk,
    'SupplierPayment', v_payment.id, v_now
  );

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
      'supplierInvoiceNo', v_po.supplier_invoice_no,
      'deliveryNoteNo', v_po.delivery_note_no,
      'notes', v_po.notes,
      'createdBy', v_po.created_by,
      'createdAt', v_po.created_at,
      'approvedBy', v_po.approved_by,
      'approvedAt', v_po.approved_at,
      'receivedBy', v_po.received_by,
      'receivedAt', v_po.received_at
    ),
    'supplierPayment', jsonb_build_object(
      'id', v_payment.id,
      'supplierId', v_payment.supplier_id,
      'purchaseOrderId', v_payment.purchase_order_id,
      'shopId', v_payment.shop_id,
      'amountMmk', v_payment.amount_mmk,
      'paymentMethod', v_payment.payment_method,
      'referenceNo', v_payment.reference_no,
      'notes', v_payment.notes,
      'paidAt', v_payment.paid_at,
      'createdBy', v_payment.created_by,
      'createdAt', v_payment.created_at,
      'voidedAt', v_payment.voided_at,
      'voidedBy', v_payment.voided_by,
      'voidReason', v_payment.void_reason
    ),
    'auditLogs', jsonb_build_array(jsonb_build_object(
      'id', v_audit_id,
      'shopId', v_po.shop_id,
      'actorId', v_user.id,
      'actionType', 'SUPPLIER_PAYMENT_RECORDED',
      'message', 'Supplier payment recorded for ' || v_po.order_no || ': MMK ' || p_amount_mmk,
      'entityType', 'SupplierPayment',
      'entityId', v_payment.id,
      'createdAt', v_now
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION record_supplier_payment(text, integer, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_supplier_payment(text, integer, text, text, text, timestamptz) TO authenticated;

-- ============================================================
-- create_refund_void_request
-- ============================================================
DROP FUNCTION IF EXISTS create_refund_void_request(text, text, text, jsonb);

CREATE OR REPLACE FUNCTION create_refund_void_request(
  p_sale_id text,
  p_type    text,
  p_reason  text,
  p_items   jsonb DEFAULT NULL
  ,p_created_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user users; v_sale sales; v_now timestamptz := resolve_event_time(p_created_at);
  v_req_id text := 'refund-' || replace(gen_random_uuid()::text, '-', '');
  v_audit_id text;
  v_perm text;
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

  v_perm := CASE WHEN p_type = 'VOID' THEN 'pos:request_void' ELSE 'pos:request_refund' END;
  IF NOT app_can_for_shop(v_perm, v_sale.shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to request a % for sales in this shop', p_type;
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

REVOKE ALL ON FUNCTION create_refund_void_request(text, text, text, jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_refund_void_request(text, text, text, jsonb, timestamptz) TO authenticated;
