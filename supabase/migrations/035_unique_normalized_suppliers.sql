-- ============================================================
-- Migration 035: unique normalized supplier codes
--
-- Business rule:
--   * Supplier codes are unique after lower(btrim(code)) when a code exists.
--
-- This migration deliberately fails on existing duplicates. Do not merge or
-- delete supplier rows automatically because purchase_orders.supplier_id and
-- supplier_payments.supplier_id reference those supplier IDs.
-- ============================================================

-- ============================================================
-- 1. Preflight: list duplicate normalized codes and abort.
-- ============================================================
DO $$
DECLARE
  v_dup_codes text;
BEGIN
  SELECT string_agg(
           format('normalized code "%s": %s', normalized_code, rows),
           '; '
           ORDER BY normalized_code
         )
    INTO v_dup_codes
    FROM (
      SELECT
        lower(btrim(code)) AS normalized_code,
        string_agg(format('%s (%s)', id, code), ', ' ORDER BY id) AS rows
      FROM suppliers
      WHERE NULLIF(btrim(code), '') IS NOT NULL
      GROUP BY lower(btrim(code))
      HAVING count(*) > 1
    ) duplicates;

  IF v_dup_codes IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migration 035 aborted: duplicate normalized supplier codes exist. ' ||
      v_dup_codes ||
      '. Rename duplicate supplier codes before re-running this migration.';
  END IF;
END;
$$;

-- ============================================================
-- 2. Unique normalized index.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_unique_normalized_code
  ON suppliers ((lower(btrim(code))))
  WHERE NULLIF(btrim(code), '') IS NOT NULL;
