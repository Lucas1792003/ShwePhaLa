-- ============================================================
-- Migration 054: Max-length guard on product name/SKU
--
-- Flagged in docs/09-roadmap-todo.md: products.name/sku are unbounded
-- text with no client or DB limit (ProductFormPage.tsx only checked
-- non-empty). Low severity, but unbounded storage/CSV export. Matches
-- the client-side limit added alongside this migration.
-- Run AFTER 001-053.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_name_max_length'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_name_max_length CHECK (length(name) <= 200);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_sku_max_length'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_sku_max_length CHECK (sku IS NULL OR length(sku) <= 64);
  END IF;
END $$;
