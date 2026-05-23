import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = (): string =>
  readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/019_product_image_upload_sessions.sql", import.meta.url)),
    "utf8",
  ).replace(/\s+/g, " ");

describe("product image phone upload session migration", () => {
  it("stores only a token hash, not the raw QR token", () => {
    const sql = migration();
    expect(sql).toContain("token_hash text NOT NULL UNIQUE");
    expect(sql).toContain("product_image_upload_token_hash(v_token)");
    expect(sql).not.toContain(" token text ");
  });

  it("expires sessions quickly and blocks completed/expired token reuse", () => {
    const sql = migration();
    expect(sql).toContain("now() + interval '10 minutes'");
    expect(sql).toContain("IF v_session.status <> 'PENDING' THEN RAISE EXCEPTION 'Upload link is no longer active'");
    expect(sql).toContain("IF v_session.expires_at <= now() THEN");
  });

  it("requires product permissions for desktop session creation", () => {
    const sql = migration();
    expect(sql).toContain("app_has_perm('product:create') OR app_has_perm('product:update')");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION create_product_image_upload_session(text, text) TO authenticated");
  });

  it("lets phones complete only a valid token-scoped storage path", () => {
    const sql = migration();
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION complete_product_image_upload_session");
    expect(sql).toContain("p_storage_path IS DISTINCT FROM v_session.storage_path");
    expect(sql).toContain("p_bytes IS NULL OR p_bytes <= 0 OR p_bytes > 102400");
    expect(sql).toContain("lower(p_public_url) LIKE 'data:%'");
  });
});
