import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Migration 042 backs the admin email-code step. The codes table must be
// service-role only: RLS enabled, no client policies, all privileges revoked
// from anon/authenticated. These assertions pin the table shape and that
// lockdown so a future edit can't silently expose live codes/hashes.

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/042_admin_login_codes.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("admin_login_codes (migration 042)", () => {
  it("creates the table keyed to the auth user with cascade delete", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS admin_login_codes");
    expect(sql).toContain("auth_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE");
  });

  it("stores only the code hash, an expiry, a consume marker and attempts", () => {
    expect(sql).toContain("code_hash text NOT NULL");
    expect(sql).toContain("expires_at timestamptz NOT NULL");
    expect(sql).toContain("consumed_at timestamptz");
    expect(sql).toContain("attempts integer NOT NULL DEFAULT 0");
  });

  it("indexes the newest code per admin", () => {
    expect(sql).toContain("admin_login_codes_auth_idx");
    expect(sql).toContain("(auth_id, created_at DESC)");
  });

  it("locks the table to the service role only (RLS on, privileges revoked)", () => {
    expect(sql).toContain("ALTER TABLE admin_login_codes ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON admin_login_codes FROM anon, authenticated");
    // No client-facing policies are granted on this table.
    expect(sql).not.toContain("CREATE POLICY");
  });
});
