-- ============================================================
-- Migration 042: admin login email codes (admin 2FA step)
--
-- Backs the post-password email-code verification for ADMIN logins. After an
-- admin signs in with their password, the `admin-2fa` edge function generates a
-- 6-digit code, stores ONLY its SHA-256 hash here with a 10-minute expiry, and
-- emails the plaintext code (via Resend) to the admin. The same function later
-- verifies the submitted code against this row.
--
-- Security: this table is service-role only. RLS is enabled with NO policies and
-- all privileges are revoked from anon/authenticated, so the anon/JWT clients
-- can never read codes, hashes, or expiries — only the edge function (service
-- role, which bypasses RLS) can.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_login_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Supabase auth user the code was issued to (not the app users.id).
  auth_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SHA-256 hex of the 6-digit code; the plaintext is never stored.
  code_hash   text NOT NULL,
  -- Deadline: rows past this are rejected by the verify path.
  expires_at  timestamptz NOT NULL,
  -- Set once the code is successfully used; a consumed code can't be reused.
  consumed_at timestamptz,
  -- Wrong-guess counter; the verify path refuses after a small cap.
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Verify/request look up the newest row per admin.
CREATE INDEX IF NOT EXISTS admin_login_codes_auth_idx
  ON admin_login_codes (auth_id, created_at DESC);

-- Lock the table down to the service role only: RLS on, no policies, and revoke
-- every privilege from the client roles. The edge function uses the service-role
-- key (bypasses RLS) for all access.
ALTER TABLE admin_login_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON admin_login_codes FROM anon, authenticated;
