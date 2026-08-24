import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression coverage for the "User already registered" login bug: a wrong
// password on an existing account used to fall through to a first-time-setup
// signUp() attempt, because the pre-check that decided "is this the very
// first user?" read the `users` table anonymously — and that table's SELECT
// policy is `TO authenticated` only (migration 010), so it always read back
// empty pre-login and misreported every failed login as first-time setup.
// See docs/10-offline-desktop-known-issues.md.

const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signUp: (...args: unknown[]) => signUp(...args),
      mfa: { listFactors: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn() },
    },
    from: () => {
      throw new Error("supabase.from should not be reached in these scenarios");
    },
  },
}));

import { useAuthStore } from "./authStore";

beforeEach(() => {
  signInWithPassword.mockReset();
  signUp.mockReset();
});

describe("login()", () => {
  it("reports 'Invalid email or password' for a wrong password on an existing account, not the signUp error", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    signUp.mockResolvedValueOnce({ error: { message: "User already registered" } });

    const result = await useAuthStore.getState().login("admin@shop.test", "wrong-password");

    expect(result.error).toBe("Invalid email or password.");
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("surfaces a genuine signUp failure instead of masking it as bad credentials", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    signUp.mockResolvedValueOnce({ error: { message: "Email rate limit exceeded" } });

    const result = await useAuthStore.getState().login("new-admin@shop.test", "somepassword");

    expect(result.error).toBe("Email rate limit exceeded");
  });
});
