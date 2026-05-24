-- ============================================================
-- Migration 026: Product Sellable Units
--
-- Unit Types remain the global base-stock unit registry. Product Units are
-- per-product sellable options used by POS; inventory remains in base units.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS product_units (
  id             text PRIMARY KEY,
  product_id     text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name           text NOT NULL,
  base_quantity  integer NOT NULL CHECK (base_quantity > 0),
  price_mmk      integer NOT NULL CHECK (price_mmk >= 0),
  is_default     boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_units_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_units_unique_active_name
  ON product_units (product_id, (lower(btrim(name))))
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS product_units_one_default
  ON product_units (product_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS product_units_product_idx
  ON product_units (product_id, sort_order);

CREATE OR REPLACE FUNCTION product_units_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_units_touch_updated_at ON product_units;
CREATE TRIGGER product_units_touch_updated_at
  BEFORE UPDATE ON product_units
  FOR EACH ROW
  EXECUTE FUNCTION product_units_set_updated_at();

INSERT INTO product_units (
  id, product_id, name, base_quantity, price_mmk, is_default, is_active,
  sort_order, created_at, updated_at
)
SELECT
  'unit-' || replace(gen_random_uuid()::text, '-', ''),
  p.id,
  COALESCE(NULLIF(btrim(p.unit_type), ''), 'Piece'),
  1,
  p.price_mmk,
  true,
  true,
  0,
  now(),
  now()
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_units pu WHERE pu.product_id = p.id
);

ALTER TABLE product_barcodes
  ADD COLUMN IF NOT EXISTS product_unit_id text REFERENCES product_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS product_barcodes_product_unit_idx
  ON product_barcodes (product_unit_id)
  WHERE product_unit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION product_barcodes_validate_unit_product()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM product_units pu
     WHERE pu.id = NEW.product_unit_id
       AND pu.product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Barcode product_unit_id must belong to the same product_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_barcodes_unit_product_match ON product_barcodes;
CREATE TRIGGER product_barcodes_unit_product_match
  BEFORE INSERT OR UPDATE OF product_id, product_unit_id ON product_barcodes
  FOR EACH ROW
  EXECUTE FUNCTION product_barcodes_validate_unit_product();

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS id text,
  ADD COLUMN IF NOT EXISTS product_unit_id text REFERENCES product_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_name_snapshot text,
  ADD COLUMN IF NOT EXISTS unit_base_quantity_snapshot integer,
  ADD COLUMN IF NOT EXISTS unit_price_mmk_snapshot integer,
  ADD COLUMN IF NOT EXISTS base_quantity_sold integer;

UPDATE sale_items
   SET id = 'item-' || replace(gen_random_uuid()::text, '-', '')
 WHERE id IS NULL;

ALTER TABLE sale_items
  ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'sale_items'::regclass
       AND conname = 'sale_items_pkey'
  ) THEN
    ALTER TABLE sale_items DROP CONSTRAINT sale_items_pkey;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'sale_items'::regclass
       AND contype = 'p'
       AND conname = 'sale_items_pkey'
  ) THEN
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS sale_items_sale_product_unit_idx
  ON sale_items (sale_id, product_id, product_unit_id);

UPDATE sale_items si
   SET unit_name_snapshot = COALESCE(si.unit_name_snapshot, si.unit_label),
       unit_base_quantity_snapshot = COALESCE(si.unit_base_quantity_snapshot, si.units_per_item, 1),
       unit_price_mmk_snapshot = COALESCE(si.unit_price_mmk_snapshot, si.unit_price_mmk),
       base_quantity_sold = COALESCE(si.base_quantity_sold, si.qty_units)
 WHERE si.unit_name_snapshot IS NULL
    OR si.unit_base_quantity_snapshot IS NULL
    OR si.unit_price_mmk_snapshot IS NULL
    OR si.base_quantity_sold IS NULL;

ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_units_sel" ON product_units;
CREATE POLICY "product_units_sel" ON product_units FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "product_units_ins" ON product_units;
CREATE POLICY "product_units_ins" ON product_units FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('product:create') OR app_has_perm('product:update'));

DROP POLICY IF EXISTS "product_units_upd" ON product_units;
CREATE POLICY "product_units_upd" ON product_units FOR UPDATE TO authenticated
  USING (app_has_perm('product:update')) WITH CHECK (app_has_perm('product:update'));

-- Keep product_units as soft-delete/deactivate rows once referenced by sales.

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
  v_unit           product_units;
  v_product_unit_id text;
  v_qty            integer;
  v_base_qty_sold  integer;
  v_unit_price     integer;
  v_item_disc      numeric;
  v_line_total     integer;
  v_qty_before     integer;
  v_qty_after      integer;
  v_price_ovr      boolean;
  v_expected_price integer;
  v_line_key       text;

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

  v_sale_item_id   text;
  v_move_id        text;
  v_audit_id       text;
  v_po_by          text;
  v_so_by          text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user := current_app_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT app_has_perm('pos:create_sale') THEN
    RAISE EXCEPTION 'You are not permitted to create sales';
  END IF;

  IF NOT app_can_for_shop('pos:create_sale', p_shop_id) THEN
    RAISE EXCEPTION 'You are not permitted to create sales in this shop';
  END IF;

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

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_items) e
     WHERE COALESCE(e->>'product_id', '') = ''
  ) THEN
    RAISE EXCEPTION 'Product is required for every sale item';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('complete_sale:' || p_shop_id));

  SELECT * INTO v_shop FROM shops WHERE id = p_shop_id;
  IF v_shop.id IS NULL THEN
    RAISE EXCEPTION 'Shop not found';
  END IF;

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

  SELECT count(*) INTO v_seq
    FROM sales
   WHERE shop_id = p_shop_id AND created_at::date = v_now::date;

  v_receipt_no := v_shop.code || '-' || to_char(v_now, 'YYYYMMDD')
                  || '-' || lpad((v_seq + 1)::text, 4, '0');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value)
  LOOP
    SELECT * INTO v_product
      FROM products
     WHERE id = (v_item->>'product_id') AND is_active = true;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found or inactive: %', (v_item->>'product_id');
    END IF;

    v_product_unit_id := NULLIF(v_item->>'product_unit_id', '');
    IF v_product_unit_id IS NULL THEN
      SELECT * INTO v_unit
        FROM product_units
       WHERE product_id = v_product.id AND is_active = true AND is_default = true
       LIMIT 1;
    ELSE
      SELECT * INTO v_unit
        FROM product_units
       WHERE id = v_product_unit_id
         AND product_id = v_product.id
         AND is_active = true;
    END IF;

    IF v_unit.id IS NULL THEN
      RAISE EXCEPTION 'Sellable unit not found or inactive for %', v_product.name;
    END IF;

    v_line_key := v_product.id || ':' || v_unit.id;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_computed) e
       WHERE e->>'line_key' = v_line_key
    ) THEN
      RAISE EXCEPTION 'A product unit appears more than once in the cart; combine the lines';
    END IF;

    v_qty := NULLIF(v_item->>'qty', '')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for %', v_product.name;
    END IF;

    v_base_qty_sold := v_qty * v_unit.base_quantity;
    v_unit_price := COALESCE(NULLIF(v_item->>'unit_price_mmk', '')::integer, v_unit.price_mmk);
    v_item_disc  := COALESCE(NULLIF(v_item->>'item_discount_pct', '')::numeric, 0);

    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Invalid unit price for %', v_product.name;
    END IF;

    IF v_item_disc < 0 OR v_item_disc > 100 THEN
      RAISE EXCEPTION 'Item discount must be between 0 and 100 for %', v_product.name;
    END IF;

    IF v_unit.is_default THEN
      SELECT pt.price_mmk INTO v_expected_price
        FROM price_tiers pt
       WHERE pt.product_id = v_product.id
         AND pt.is_active = true
         AND (pt.shop_id = p_shop_id OR pt.shop_id IS NULL)
         AND v_base_qty_sold >= pt.min_qty
         AND (pt.max_qty IS NULL OR v_base_qty_sold <= pt.max_qty)
       ORDER BY
         CASE WHEN pt.shop_id = p_shop_id THEN 0 ELSE 1 END,
         pt.min_qty DESC
       LIMIT 1;

      v_expected_price := COALESCE(v_expected_price, v_unit.price_mmk);
    ELSE
      v_expected_price := v_unit.price_mmk;
    END IF;

    v_price_ovr := COALESCE(NULLIF(v_item->>'price_overridden', '')::boolean, false)
                   OR v_unit_price IS DISTINCT FROM v_expected_price;

    IF v_price_ovr AND NOT v_can_ovr_price THEN
      RAISE EXCEPTION 'You are not permitted to override prices';
    END IF;

    SELECT qty_base_units INTO v_qty_before
      FROM inventory
     WHERE shop_id = p_shop_id AND product_id = v_product.id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory row not found for % in %', v_product.name, v_shop.name;
    END IF;

    v_qty_after := v_qty_before - v_base_qty_sold;

    IF v_qty_after < 0 AND NOT v_can_ovr_stock THEN
      RAISE EXCEPTION 'Insufficient stock for %: have %, need %',
        v_product.name, v_qty_before, v_base_qty_sold;
    END IF;

    v_line_total := round(v_qty * v_unit_price * (1 - v_item_disc / 100))::integer;
    v_subtotal   := v_subtotal + (v_unit_price * v_qty);
    v_after_disc := v_after_disc + v_line_total;

    v_computed := v_computed || jsonb_build_array(jsonb_build_object(
      'line_key',       v_line_key,
      'product_id',     v_product.id,
      'product_name',   v_product.name,
      'product_unit_id', v_unit.id,
      'unit_name',      v_unit.name,
      'unit_base_qty',  v_unit.base_quantity,
      'qty',            v_qty,
      'base_qty_sold',  v_base_qty_sold,
      'unit_price',     v_unit_price,
      'item_discount',  v_item_disc,
      'line_total',     v_line_total,
      'qty_before',     v_qty_before,
      'qty_after',      v_qty_after,
      'price_ovr',      v_price_ovr,
      'stock_ovr',      (v_qty_after < 0)
    ));
  END LOOP;

  v_cart_disc := round(v_after_disc * COALESCE(p_cart_discount_pct, 0) / 100)::integer;
  v_total     := greatest(0, v_after_disc - v_cart_disc);
  v_discount  := v_subtotal - v_total;
  v_change    := greatest(0, p_paid_mmk - v_total);

  IF p_paid_mmk < v_total THEN
    RAISE EXCEPTION 'Paid amount is less than the sale total';
  END IF;

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
      base_quantity_sold, stock_override_by
    )
    VALUES (
      v_sale_item_id, v_sale_id, v_c->>'product_id', v_c->>'product_unit_id',
      (v_c->>'base_qty_sold')::integer, (v_c->>'unit_price')::integer,
      NULLIF((v_c->>'item_discount')::numeric, 0),
      (v_c->>'line_total')::integer, v_po_by,
      v_c->>'unit_name', (v_c->>'unit_base_qty')::integer,
      v_c->>'unit_name', (v_c->>'unit_base_qty')::integer,
      (v_c->>'unit_price')::integer, (v_c->>'base_qty_sold')::integer,
      v_so_by
    );

    UPDATE inventory
       SET qty_base_units = (v_c->>'qty_after')::integer
     WHERE shop_id = p_shop_id AND product_id = v_c->>'product_id';

    v_move_id := 'move-' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO inventory_movements (
      id, shop_id, product_id, type, qty_change,
      qty_before, qty_after, reason, reference_type, reference_id,
      created_by, created_at
    )
    VALUES (
      v_move_id, p_shop_id, v_c->>'product_id', 'SALE_OUT',
      -(v_c->>'base_qty_sold')::integer, (v_c->>'qty_before')::integer,
      (v_c->>'qty_after')::integer, 'Sale ' || v_receipt_no,
      'sale', v_sale_id, v_user.id, v_now
    );

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
      'stockOverrideBy', v_so_by
    ));

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
      'createdAt', v_now
    ));

    v_inv_out := v_inv_out || jsonb_build_array(jsonb_build_object(
      'shopId', p_shop_id,
      'productId', v_c->>'product_id',
      'qtyBaseUnits', (v_c->>'qty_after')::integer
    ));

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

