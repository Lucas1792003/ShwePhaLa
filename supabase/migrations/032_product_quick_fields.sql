-- ============================================================
-- Migration 032: Product quick-win fields
--
-- Six additive fields ported from the legacy POS Setup screen.
-- All nullable / default-false so existing products keep working
-- with zero backfill and old code paths stay correct.
--
--   short_name      — compact display name (e.g. "Lager Can"
--                     vs. full "Myanmar Lager Can 330ml")
--   alias_code      — secondary identifier; app-layer uniqueness
--                     (same model as `sku` — no DB constraint)
--   max_qty         — reorder ceiling, complements low_stock_threshold
--   is_open_price   — true → POS prompts cashier for price at cart-add
--                     (server-side enforcement lands in a follow-up RPC migration)
--   is_non_stock    — true → POS skips inventory deduction
--                     (server-side enforcement lands in a follow-up RPC migration)
--   purchase_type   — default purchase terms on new POs for this product
--                     ('COD' | 'CREDIT' | NULL = unspecified)
--
-- All six can be set today via the Product form. The behavioural
-- changes (POS open-price flow, non-stock skip, PO default term)
-- are deliberately deferred to a follow-up RPC migration so this
-- migration is purely additive and never partially breaks a sale.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS short_name      text,
  ADD COLUMN IF NOT EXISTS alias_code      text,
  ADD COLUMN IF NOT EXISTS max_qty         integer
    CHECK (max_qty IS NULL OR max_qty >= 0),
  ADD COLUMN IF NOT EXISTS is_open_price   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_non_stock    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_type   text
    CHECK (purchase_type IS NULL OR purchase_type IN ('COD', 'CREDIT'));

-- The Product form does a "MaxQty >= lowStockThreshold" sanity check
-- at submit time, but we don't enforce it in the DB. A legitimate
-- workflow is to set max_qty BEFORE adjusting the threshold (e.g.
-- during a category-wide reorder cadence change), so a DB-side check
-- would just create friction without preventing anything bad.

-- Helpful index for searching by alias_code from the POS scan path
-- (same access pattern as `sku`). Partial — only meaningful when set.
CREATE INDEX IF NOT EXISTS products_alias_code_idx
  ON products ((lower(btrim(alias_code))))
  WHERE alias_code IS NOT NULL AND length(btrim(alias_code)) > 0;
