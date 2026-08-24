import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Offline coverage for restoreSession()'s auth-cache fallback — see
// docs/10-offline-desktop-known-issues.md for the bug this fixes: without
// it, reopening the app offline logs the user out even with a perfectly
// valid cached Supabase session, because resolveAppUser() can't reach
// `users` to confirm the role/active flag.

const getSession = vi.fn();
const maybeSingle = vi.fn();
const listFactors = vi.fn();
const getAAL = vi.fn();

// Every mock fn is referenced through a wrapper arrow, not embedded
// directly — vi.mock's factory is hoisted above these `const`s, so a direct
// reference would hit the TDZ. The wrapper defers the lookup to call time,
// by which point the real `const` has initialized. See saleSlice tests for
// the same pattern.
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      mfa: {
        listFactors: (...args: unknown[]) => listFactors(...args),
        getAuthenticatorAssuranceLevel: (...args: unknown[]) => getAAL(...args),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: (...args: unknown[]) => maybeSingle(...args) }),
      }),
    }),
  },
}));

import { useAuthStore } from "./authStore";
import { localDb } from "../lib/localDb";

const AUTH_ID = "auth-user-1";
const session = { user: { id: AUTH_ID, email: "cashier@shop.test" } };

beforeEach(async () => {
  getSession.mockReset();
  maybeSingle.mockReset();
  listFactors.mockReset();
  getAAL.mockReset();
  await localDb.authCache.clear();
  vi.stubGlobal("navigator", { onLine: true });
  useAuthStore.setState({ currentUserId: null, currentRole: null, adminVerified: false, hasTotp: false, isAuthLoading: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("restoreSession offline fallback", () => {
  it("falls back to a fresh cached user when resolveAppUser fails as a network error", async () => {
    getSession.mockResolvedValue({ data: { session } });
    vi.stubGlobal("navigator", { onLine: false });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    await localDb.authCache.put({
      authId: AUTH_ID, userId: "user-1", role: "CASHIER", shopId: "shop-1",
      isActive: true, hasTotp: false, cachedAt: new Date().toISOString(),
    });

    await useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.currentUserId).toBe("user-1");
    expect(state.currentRole).toBe("CASHIER");
    expect(state.adminVerified).toBe(true); // non-admin is always considered verified
    expect(state.isAuthLoading).toBe(false);
  });

  it("logs out when offline and there is no cached user", async () => {
    getSession.mockResolvedValue({ data: { session } });
    vi.stubGlobal("navigator", { onLine: false });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().currentUserId).toBeNull();
  });

  it("does not trust a cache entry older than the 24h offline session window", async () => {
    getSession.mockResolvedValue({ data: { session } });
    vi.stubGlobal("navigator", { onLine: false });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    const staleTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await localDb.authCache.put({
      authId: AUTH_ID, userId: "user-1", role: "CASHIER", shopId: "shop-1",
      isActive: true, hasTotp: false, cachedAt: staleTimestamp,
    });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().currentUserId).toBeNull();
  });

  it("does NOT fall back to cache for a genuine (non-network) resolution error", async () => {
    getSession.mockResolvedValue({ data: { session } });
    // Online, and the error itself doesn't look like a network failure.
    maybeSingle.mockResolvedValue({ data: null, error: { message: "permission denied for table users" } });
    await localDb.authCache.put({
      authId: AUTH_ID, userId: "user-1", role: "CASHIER", shopId: "shop-1",
      isActive: true, hasTotp: false, cachedAt: new Date().toISOString(),
    });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().currentUserId).toBeNull();
  });

  it("does not claim a fresh aal2 step-up for a cached ADMIN restored offline", async () => {
    getSession.mockResolvedValue({ data: { session } });
    vi.stubGlobal("navigator", { onLine: false });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });
    await localDb.authCache.put({
      authId: AUTH_ID, userId: "admin-1", role: "ADMIN", shopId: null,
      isActive: true, hasTotp: true, cachedAt: new Date().toISOString(),
    });

    await useAuthStore.getState().restoreSession();

    const state = useAuthStore.getState();
    expect(state.currentUserId).toBe("admin-1");
    expect(state.hasTotp).toBe(true); // reused from cache
    expect(state.adminVerified).toBe(false); // no aal2 step-up possible offline, no prior session verification either
    expect(listFactors).not.toHaveBeenCalled(); // never attempted the network MFA check
  });

  it("resolves normally (and refreshes the cache) when online", async () => {
    getSession.mockResolvedValue({ data: { session } });
    maybeSingle.mockResolvedValue({ data: { id: "user-1", role: "MANAGER", shop_id: "shop-1", is_active: true, auth_id: AUTH_ID }, error: null });

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().currentUserId).toBe("user-1");
    const cached = await localDb.authCache.get(AUTH_ID);
    expect(cached).toMatchObject({ userId: "user-1", role: "MANAGER" });
  });
});
