-- ============================================================
-- Migration 025: Dynamic Unit Types registry
--
-- Replaces the hardcoded Unit Type dropdown in the Product form
-- with an admin-managed table. `products.unit_type` stays a plain
-- text column for backward compatibility — the new registry just
-- governs which values appear in the picker.
--
-- Future work (NOT in this migration):
--   * product_units (per-product sellable units, base_quantity,
--     unit-specific price + barcode)
--   * POS deduction by base units
-- See docs/09-roadmap-todo.md.
-- ============================================================

CREATE TABLE IF NOT EXISTS unit_types (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  abbreviation  text,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_types_name_not_blank
    CHECK (length(btrim(name)) > 0),
  CONSTRAINT unit_types_abbrev_not_blank
    CHECK (abbreviation IS NULL OR length(btrim(abbreviation)) > 0)
);

-- Case-insensitive uniqueness on name; abbreviation is optional but
-- must be unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS unit_types_unique_normalized_name
  ON unit_types ((lower(btrim(name))));

CREATE UNIQUE INDEX IF NOT EXISTS unit_types_unique_normalized_abbrev
  ON unit_types ((lower(btrim(abbreviation))))
  WHERE abbreviation IS NOT NULL AND length(btrim(abbreviation)) > 0;

-- Auto-touch updated_at.
CREATE OR REPLACE FUNCTION unit_types_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS unit_types_touch_updated_at ON unit_types;
CREATE TRIGGER unit_types_touch_updated_at
  BEFORE UPDATE ON unit_types
  FOR EACH ROW
  EXECUTE FUNCTION unit_types_set_updated_at();

-- ------------------------------------------------------------
-- RLS — read for everyone authenticated; write requires
-- `product:create` (the same permission used for categories
-- and admin/products writes; held by ADMIN by default).
-- ------------------------------------------------------------
ALTER TABLE unit_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unit_types_sel" ON unit_types;
CREATE POLICY "unit_types_sel" ON unit_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "unit_types_ins" ON unit_types;
CREATE POLICY "unit_types_ins" ON unit_types FOR INSERT TO authenticated
  WITH CHECK (app_has_perm('product:create'));

DROP POLICY IF EXISTS "unit_types_upd" ON unit_types;
CREATE POLICY "unit_types_upd" ON unit_types FOR UPDATE TO authenticated
  USING (app_has_perm('product:create')) WITH CHECK (app_has_perm('product:create'));

-- Hard delete is intentionally not exposed — the UI deactivates
-- instead, preserving any product that still references the name.

-- ------------------------------------------------------------
-- Seed defaults — idempotent. `ON CONFLICT (id) DO NOTHING`
-- keeps re-running the migration safe and never overwrites edits
-- an admin made through the UI.
-- ------------------------------------------------------------
INSERT INTO unit_types (id, name, abbreviation, sort_order, is_active) VALUES
  ('ut-piece',    'Piece',    'pc',     10, true),
  ('ut-can',      'Can',      'can',    20, true),
  ('ut-bottle',   'Bottle',   'btl',    30, true),
  ('ut-sachet',   'Sachet',   'sachet', 40, true),
  ('ut-box',      'Box',      'box',    50, true),
  ('ut-pack',     'Pack',     'pack',   60, true),
  ('ut-case',     'Case',     'case',   70, true),
  ('ut-kilogram', 'Kilogram', 'kg',     80, true),
  ('ut-liter',    'Liter',    'L',      90, true)
ON CONFLICT (id) DO NOTHING;
