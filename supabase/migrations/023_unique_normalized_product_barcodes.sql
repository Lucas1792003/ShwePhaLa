-- ============================================================
-- Migration 023: unique normalized product barcodes
--
-- Business rule:
--   * A package barcode value uniquely identifies a single product
--     after lower(btrim(value)). Two products cannot share the same
--     scannable code, or POS lookup becomes ambiguous.
--
-- The preflight deliberately aborts on existing duplicates. Do not
-- merge or silently delete barcode rows automatically — the user may
-- have intentionally registered the same value against two different
-- products (a data-entry mistake) and only they can decide which
-- mapping is correct.
-- ============================================================

-- ============================================================
-- 1. Preflight: list duplicate normalized barcode values and abort.
-- ============================================================
DO $$
DECLARE
  v_dup_values text;
BEGIN
  SELECT string_agg(
           format('normalized value "%s": %s', normalized_value, rows),
           '; '
           ORDER BY normalized_value
         )
    INTO v_dup_values
    FROM (
      SELECT
        lower(btrim(value)) AS normalized_value,
        string_agg(
          format('%s (product %s)', id, product_id),
          ', '
          ORDER BY id
        ) AS rows
      FROM product_barcodes
      WHERE NULLIF(btrim(value), '') IS NOT NULL
      GROUP BY lower(btrim(value))
      HAVING count(*) > 1
    ) duplicates;

  IF v_dup_values IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migration 023 aborted: duplicate normalized barcode values exist. ' ||
      v_dup_values ||
      '. Resolve each conflict (delete one product''s barcode row, or change one of the values) before re-running this migration.';
  END IF;
END;
$$;

-- ============================================================
-- 2. Unique normalized index on product_barcodes.value.
--    Partial WHERE skips empty values so seed data with a blank
--    placeholder string doesn't block the index.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS product_barcodes_unique_normalized_value
  ON product_barcodes ((lower(btrim(value))))
  WHERE NULLIF(btrim(value), '') IS NOT NULL;
