-- ============================================================
-- Migration 017: category icon key
-- Categories are now icon-based (shared with the POS category buttons).
-- Adds an optional `icon_key` column holding a key from the frontend icon
-- registry (src/features/categories/categoryIcons.ts).
--
-- `color` is intentionally KEPT for backward compatibility — it is now only a
-- visual accent. Existing rows have `icon_key = NULL`; the app resolves an
-- icon from the category name in that case, so no data backfill is required.
--
-- Frontend / UI change only — no RLS, RPC or operational flow is affected.
-- Run AFTER 001-016. Idempotent.
-- ============================================================

ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon_key text;
