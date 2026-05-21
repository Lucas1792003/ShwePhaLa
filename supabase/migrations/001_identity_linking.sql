-- ============================================================
-- Migration 001: Identity Linking
-- Links app `users` rows to Supabase Auth accounts via auth_id.
-- Safe to run multiple times (idempotent). Does NOT delete any rows.
-- Run this in the Supabase SQL Editor.
-- ============================================================

-- 1. Add the auth_id column (nullable — existing rows stay valid).
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id uuid;

-- 2. One app user per auth account.
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_auth_id_unique UNIQUE (auth_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Foreign key to auth.users. ON DELETE SET NULL keeps the staff
--    profile if the auth account is removed (no user data is lost).
DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_auth_id_fkey
    FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Backfill by email — ONLY where the match is unambiguous:
--    exactly one app user AND exactly one auth user share the email.
UPDATE users u
SET auth_id = au.id
FROM auth.users au
WHERE u.auth_id IS NULL
  AND u.email IS NOT NULL
  AND lower(u.email) = lower(au.email)
  AND (SELECT count(*) FROM users u2     WHERE lower(u2.email)  = lower(u.email)) = 1
  AND (SELECT count(*) FROM auth.users a2 WHERE lower(a2.email) = lower(u.email)) = 1;

-- 5. Review report — run separately to see who still needs manual linking:
--    SELECT id, name, email, auth_id FROM users WHERE auth_id IS NULL;
--    -- rows here have: no email, a duplicate email, or no auth account yet.
--    -- Un-migrated rows are also self-healed on next successful login.
