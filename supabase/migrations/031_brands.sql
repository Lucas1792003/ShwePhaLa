-- ============================================================
-- Migration 031: Brands (Category → Brand hierarchy)
--
-- Concept:
--   Some categories (e.g. WHISKY) group multiple brands
--   (GRAND ROYAL, ROYAL CLUB, …). Brand is a child of Category.
--   Products MAY have a brand. New products are required to pick
--   one via the form layer; the DB stays permissive so legacy
--   products (created before this migration) keep working.
--
-- Why not a self-referencing category tree?
--   The old POS this is modeled after uses a fixed 2-level
--   structure (Category → Brand). Modeling Brand as its own
--   table makes the semantics explicit and keeps category
--   queries unchanged everywhere else (POS grid filter,
--   Dashboard "Sales by Category", Catalog).
--
-- products.category remains a free-form name string. It is NOT
-- replaced — brand is additive. A product can have:
--   * category set, brand_id NULL  (loose grouping)       — legacy & "GENERAL"-style
--   * category set, brand_id set    (curated)              — the new path
-- ============================================================

-- ------------------------------------------------------------
-- 1. brands table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brands (
  id          text PRIMARY KEY,
  category_id text NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  color       text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brands_name_not_blank CHECK (length(btrim(name)) > 0)
);

-- One active brand per name within a category. Case-insensitive
-- and whitespace-trimmed so "Grand Royal" and "  GRAND ROYAL "
-- collide — matches how categories already enforce uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS brands_unique_active_name_per_category
  ON brands (category_id, (lower(btrim(name))))
  WHERE is_active;

CREATE INDEX IF NOT EXISTS brands_category_idx
  ON brands (category_id, is_active);

CREATE OR REPLACE FUNCTION brands_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brands_touch_updated_at ON brands;
CREATE TRIGGER brands_touch_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION brands_set_updated_at();

-- ------------------------------------------------------------
-- 2. RLS — mirrors categories. Anyone authenticated may read;
-- only holders of product:create may insert/update.
-- ------------------------------------------------------------
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brands_sel" ON brands;
CREATE POLICY "brands_sel" ON brands FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "brands_ins" ON brands;
CREATE POLICY "brands_ins" ON brands FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('product:create'));

DROP POLICY IF EXISTS "brands_upd" ON brands;
CREATE POLICY "brands_upd" ON brands FOR UPDATE TO authenticated
  USING      (app_has_perm('product:create'))
  WITH CHECK (app_has_perm('product:create'));

-- Delete intentionally omitted. The slice layer performs a
-- soft-delete (is_active = false) and blocks if any product
-- still references the brand, mirroring categories.

-- ------------------------------------------------------------
-- 3. products.brand_id — additive, nullable, no data backfill
-- ------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS brand_id text REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_brand_idx
  ON products (brand_id)
  WHERE brand_id IS NOT NULL;
