-- ============================================================
-- Migration 022: unique normalized shops
--
-- Business rules:
--   * Shop names are unique after lower(trim(name)).
--   * Shop codes are unique after lower(trim(code)) when a code exists.
--
-- This migration deliberately fails on existing duplicates. Do not merge
-- or delete shop rows automatically because sales, inventory, shifts, users,
-- purchases, and transfers may reference those shop IDs.
-- ============================================================

-- ============================================================
-- 1. Preflight: list duplicate normalized names/codes and abort.
-- ============================================================
DO $$
DECLARE
  v_dup_names text;
  v_dup_codes text;
BEGIN
  SELECT string_agg(
           format('normalized name "%s": %s', normalized_name, rows),
           '; '
           ORDER BY normalized_name
         )
    INTO v_dup_names
    FROM (
      SELECT
        lower(btrim(name)) AS normalized_name,
        string_agg(format('%s (%s)', id, name), ', ' ORDER BY id) AS rows
      FROM shops
      GROUP BY lower(btrim(name))
      HAVING count(*) > 1
    ) duplicates;

  IF v_dup_names IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migration 022 aborted: duplicate normalized shop names exist. ' ||
      v_dup_names ||
      '. Rename duplicate shop rows before re-running this migration.';
  END IF;

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
      FROM shops
      WHERE NULLIF(btrim(code), '') IS NOT NULL
      GROUP BY lower(btrim(code))
      HAVING count(*) > 1
    ) duplicates;

  IF v_dup_codes IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migration 022 aborted: duplicate normalized shop codes exist. ' ||
      v_dup_codes ||
      '. Rename duplicate shop codes before re-running this migration.';
  END IF;
END;
$$;

-- ============================================================
-- 2. Unique normalized indexes.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS shops_unique_normalized_name
  ON shops ((lower(btrim(name))));

CREATE UNIQUE INDEX IF NOT EXISTS shops_unique_normalized_code
  ON shops ((lower(btrim(code))))
  WHERE NULLIF(btrim(code), '') IS NOT NULL;
