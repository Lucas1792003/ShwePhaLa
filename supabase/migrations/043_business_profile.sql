-- ============================================================
-- Migration 043: business profile (brand) — singleton row
--
-- Holds the business-wide brand shown across the app: name, logo, and contact
-- details. A single row (id = 'default'); the Profile settings page reads and
-- updates it. Everyone signed in may read it (sidebar header, receipts); only
-- an ADMIN may update it.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_profile (
  id            text PRIMARY KEY DEFAULT 'default',
  business_name text,
  logo_url      text,
  address       text,
  phone         text,
  email         text,
  tagline       text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Enforce the singleton: only the 'default' row may ever exist.
  CONSTRAINT business_profile_singleton CHECK (id = 'default')
);

-- Seed the single row so the app always has something to read/update.
INSERT INTO business_profile (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

ALTER TABLE business_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_profile_sel" ON business_profile;
DROP POLICY IF EXISTS "business_profile_upd" ON business_profile;

-- Brand is non-sensitive and rendered for every signed-in user.
CREATE POLICY "business_profile_sel" ON business_profile FOR SELECT TO authenticated
  USING (true);

-- Only admins can change the brand.
CREATE POLICY "business_profile_upd" ON business_profile FOR UPDATE TO authenticated
  USING (app_role() = 'ADMIN') WITH CHECK (app_role() = 'ADMIN');

-- Singleton: clients read + update only; the row is seeded here.
GRANT SELECT, UPDATE ON business_profile TO authenticated;
REVOKE INSERT, DELETE ON business_profile FROM anon, authenticated;
