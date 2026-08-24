-- ============================================================
-- Migration 044: updated_at on the remaining mutable-in-place tables
--
-- The offline-first sync layer needs a reliable way to ask "what changed
-- since I last synced?" without re-pulling every row. Append-only tables
-- (sales, sale_items, inventory_movements, audit_logs) already support that
-- via created_at. Tables that get edited in place after creation need
-- updated_at instead — most already have it (product_units, unit_types,
-- price_levels, product_unit_prices, brands, business_profile), but these
-- core operational tables don't: products, categories, suppliers,
-- purchase_orders, stock_transfers, shifts.
--
-- Uses one shared trigger function instead of a dedicated one per table
-- (brands_set_updated_at() in migration 031 predates this and is left
-- as-is — not worth touching a working trigger for a naming nit).
--
-- Idempotent. Run AFTER 001-043.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'categories', 'suppliers', 'purchase_orders', 'stock_transfers', 'shifts']
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_touch_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_touch_updated_at', t
    );
  END LOOP;
END;
$$;
