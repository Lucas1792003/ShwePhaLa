-- ============================================================
-- Migration 046: auto-create inventory rows for every active
-- product × active shop combination, going forward.
--
-- A product only ever got an `inventory (shop_id, product_id,
-- qty_base_units)` row the first time it was stocked (purchase receive /
-- adjust). Until then, POS defaults the missing row to 0 (correctly shows
-- "0 in stock"), but the dashboard's all-shops Low Stock card only SCANS
-- EXISTING inventory rows — so a never-stocked product that's genuinely
-- out of stock silently never triggers a low-stock warning. See
-- docs/04-features-workflows.md and the one-off backfill this migration
-- complements: supabase/backfill_inventory_rows.sql (run that once,
-- separately, for pre-existing data — this migration only prevents the
-- gap from recurring for anything created/reactivated from now on).
--
-- Covers every way a new active-product × active-shop combination can
-- come into existence, not just the two flows named in the roadmap item:
--   - a new product created (active) while shops already exist
--   - a new shop created (active) while products already exist
--   - a previously-inactive product reactivated (is_active: false → true)
--   - a previously-inactive shop reactivated
-- All four are covered uniformly by triggers on INSERT and on UPDATE OF
-- is_active for both tables — this also means CSV product import, the
-- seed script, and any future insert path all get this for free, since
-- the guarantee lives at the database level, not in one UI call site.
--
-- `inventory` has no client-facing INSERT policy (migration 010 revokes
-- INSERT/UPDATE/DELETE from `authenticated` entirely — it's RPC-write-only
-- for real stock, by design), so these trigger functions must be
-- SECURITY DEFINER to place the qty-0 placeholder rows. They only ever
-- INSERT ... ON CONFLICT DO NOTHING — never touch qty_base_units of an
-- existing row — so a product/shop that already has real stock activity
-- is completely unaffected.
--
-- Idempotent. Run AFTER 001-045.
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_inventory_rows_for_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    INSERT INTO inventory (shop_id, product_id, qty_base_units)
    SELECT s.id, NEW.id, 0
    FROM shops s
    WHERE s.is_active = true
    ON CONFLICT (shop_id, product_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_ensure_inventory_rows ON products;
CREATE TRIGGER products_ensure_inventory_rows
AFTER INSERT OR UPDATE OF is_active ON products
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION ensure_inventory_rows_for_product();

CREATE OR REPLACE FUNCTION ensure_inventory_rows_for_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    INSERT INTO inventory (shop_id, product_id, qty_base_units)
    SELECT NEW.id, p.id, 0
    FROM products p
    WHERE p.is_active = true
    ON CONFLICT (shop_id, product_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shops_ensure_inventory_rows ON shops;
CREATE TRIGGER shops_ensure_inventory_rows
AFTER INSERT OR UPDATE OF is_active ON shops
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION ensure_inventory_rows_for_shop();
