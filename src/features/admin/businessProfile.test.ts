import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Migration 043 holds the business brand (name, logo, contacts) as a singleton
// row. These assertions pin the table shape, the single-row guard, the seed,
// and the RLS: any signed-in user may read, only an ADMIN may update.

const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/043_business_profile.sql", import.meta.url)),
  "utf8",
).replace(/\s+/g, " ");

describe("business_profile (migration 043)", () => {
  it("creates a singleton table with the brand columns", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS business_profile");
    expect(sql).toContain("id text PRIMARY KEY DEFAULT 'default'");
    for (const col of ["business_name", "logo_url", "address", "phone", "email", "tagline"]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain("CHECK (id = 'default')");
  });

  it("seeds the default row", () => {
    expect(sql).toContain("INSERT INTO business_profile (id) VALUES ('default')");
  });

  it("lets any signed-in user read but only ADMIN update", () => {
    expect(sql).toContain("ALTER TABLE business_profile ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain('FOR SELECT TO authenticated');
    expect(sql).toContain("USING (true)");
    expect(sql).toContain("FOR UPDATE TO authenticated");
    expect(sql).toContain("app_role() = 'ADMIN'");
    expect(sql).toContain("REVOKE INSERT, DELETE ON business_profile FROM anon, authenticated");
  });
});
