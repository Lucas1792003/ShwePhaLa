import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { isNetworkError } from "../lib/errors";
import { localDb, type CachedAuthUser } from "../lib/localDb";

interface LoginResult {
  error: string | null;
  role?: string;
  shopId?: string;
}

interface RequestCodeResult {
  error: string | null;
  expiresAt?: string;
  email?: string;
}

interface EnrollTotpResult {
  error: string | null;
  factorId?: string;
  qrCode?: string;
  secret?: string;
  uri?: string;
}

// A registered authenticator (TOTP) factor, as shown on the Security page.
export interface TotpFactor {
  id: string;
  friendlyName?: string;
  status: "verified" | "unverified";
  createdAt: string;
  updatedAt: string;
  lastChallengedAt?: string;
}

interface AuthState {
  currentUserId: string | null;
  // Role of the signed-in user, captured at login/restore so route guards can
  // gate the admin verification step before the data store's users are loaded.
  currentRole: string | null;
  // True once an ADMIN has passed verification this session — via TOTP (the
  // Supabase session is aal2) OR the emailed code. Always true for non-admins.
  adminVerified: boolean;
  // Whether the signed-in admin has a verified authenticator-app (TOTP) factor.
  // Drives whether the verify page asks for the app code or the email code.
  hasTotp: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  // Admin 2FA — email path: send a code, then verify it.
  requestAdminCode: () => Promise<RequestCodeResult>;
  verifyAdminCode: (code: string) => Promise<{ error: string | null }>;
  // Admin 2FA — authenticator-app (TOTP) path via Supabase built-in MFA.
  listTotpFactors: () => Promise<{ error: string | null; factors: TotpFactor[] }>;
  enrollTotp: (friendlyName?: string) => Promise<EnrollTotpResult>;
  verifyTotpEnrollment: (factorId: string, code: string) => Promise<{ error: string | null }>;
  verifyTotpLogin: (code: string) => Promise<{ error: string | null }>;
  unenrollTotp: (factorId: string) => Promise<{ error: string | null }>;
}

// Read the user's current MFA posture: whether they have a verified TOTP factor
// and whether this session has already stepped up to aal2 (TOTP passed).
async function readMfaState(): Promise<{ hasTotp: boolean; isAal2: boolean }> {
  try {
    const [factorsRes, aalRes] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const hasTotp = (factorsRes.data?.totp ?? []).some((f) => f.status === "verified");
    const isAal2 = aalRes.data?.currentLevel === "aal2";
    return { hasTotp, isAal2 };
  } catch {
    return { hasTotp: false, isAal2: false };
  }
}

async function listTotpFactorRows(): Promise<{ error: string | null; factors: TotpFactor[] }> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { error: error.message, factors: [] };
  const factors = (data?.all ?? [])
    .filter((factor) => factor.factor_type === "totp")
    .map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name,
      status: factor.status,
      createdAt: factor.created_at,
      updatedAt: factor.updated_at,
      lastChallengedAt: factor.last_challenged_at,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { error: null, factors };
}

// Per-browser-session "this admin already passed the code" marker. sessionStorage
// survives a refresh but clears when the browser/tab closes — so a returning
// session re-verifies, a refresh does not. Stores the auth user id it applies to.
const VERIFIED_KEY = "shwe_admin_verified";
const safeSession = (): Storage | null =>
  typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null;
const isVerifiedThisSession = (authId: string | undefined): boolean =>
  Boolean(authId) && safeSession()?.getItem(VERIFIED_KEY) === authId;
const markVerified = (authId: string) => safeSession()?.setItem(VERIFIED_KEY, authId);
const clearVerified = () => safeSession()?.removeItem(VERIFIED_KEY);

// Invoke the admin-2fa edge function, surfacing the JSON error body that comes
// back on a non-2xx response (otherwise supabase-js only gives a generic message).
async function invokeAdmin2fa(
  payload: { action: "request" | "verify"; code?: string },
): Promise<{ error: string | null; data: Record<string, unknown> | null }> {
  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("admin-2fa", {
    body: payload,
  });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === "function") {
      try {
        const parsed = await (ctx as Response).json();
        if (parsed?.error) message = String(parsed.error);
      } catch {
        /* keep the generic message */
      }
    }
    return { error: message, data: null };
  }
  return { error: null, data: data ?? null };
}

// App `users` row shape used during auth resolution.
interface AppUserRow {
  id: string;
  role: string;
  shop_id: string | null;
  is_active: boolean;
  auth_id: string | null;
}

interface ResolveResult {
  user?: AppUserRow;
  error?: string;
}

const USER_FIELDS = "id, role, shop_id, is_active, auth_id";

// Escape LIKE wildcards so emails containing _ or % match literally.
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Resolve the app `users` row for an authenticated Supabase user.
 *
 * Trusted path: match on `auth_id` (the identity link).
 * Fallback path: match on email for rows not yet linked, then self-heal by
 *   writing `auth_id` so future logins use the trusted path.
 *
 * Edge cases handled:
 *  - no app row found            -> { } (caller decides: first-admin vs orphan)
 *  - duplicate email             -> { error }
 *  - email row linked elsewhere  -> { error }
 */
async function resolveAppUser(authUser: { id: string; email?: string }): Promise<ResolveResult> {
  // 1. Trusted identity link.
  const byAuthId = await supabase
    .from("users")
    .select(USER_FIELDS)
    .eq("auth_id", authUser.id)
    .maybeSingle();
  if (byAuthId.error) return { error: byAuthId.error.message };
  if (byAuthId.data) return { user: byAuthId.data as AppUserRow };

  // 2. Fallback: email match for un-migrated rows.
  if (!authUser.email) return {};
  const byEmail = await supabase
    .from("users")
    .select(USER_FIELDS)
    .ilike("email", escapeLike(authUser.email));
  if (byEmail.error) return { error: byEmail.error.message };

  const rows = (byEmail.data ?? []) as AppUserRow[];
  if (rows.length === 0) return {};
  if (rows.length > 1) {
    return { error: "Multiple staff profiles share this email. Contact an administrator." };
  }

  const row = rows[0];
  if (row.auth_id && row.auth_id !== authUser.id) {
    return { error: "This staff profile is linked to a different account. Contact an administrator." };
  }

  // Self-healing link: write auth_id once (guarded against a concurrent link).
  if (!row.auth_id) {
    const link = await supabase
      .from("users")
      .update({ auth_id: authUser.id })
      .eq("id", row.id)
      .is("auth_id", null);
    if (link.error) console.error("[auth] auth_id link failed:", link.error.message);
    else row.auth_id = authUser.id;
  }

  return { user: row };
}

// How long a device trusts its last-known login while it can't reach the
// network to re-verify (e.g. a deactivated/reassigned user's access should
// still lapse within a shift-to-shift cycle, not stay open indefinitely).
// See docs/10-offline-desktop-known-issues.md.
const OFFLINE_SESSION_TRUST_MS = 24 * 60 * 60 * 1000;

async function cacheAppUser(authId: string, user: AppUserRow, hasTotp: boolean): Promise<void> {
  try {
    await localDb.authCache.put({
      authId, userId: user.id, role: user.role, shopId: user.shop_id,
      isActive: user.is_active, hasTotp, cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[auth] Failed to cache the resolved user for offline restore:", err);
  }
}

// Returns the cached user only if it's still within the trust window —
// past that, prefer today's "log out" behavior over trusting a
// potentially-stale role/active flag indefinitely.
async function getCachedAppUser(authId: string): Promise<CachedAuthUser | undefined> {
  try {
    const cached = await localDb.authCache.get(authId);
    if (!cached) return undefined;
    const age = Date.now() - Date.parse(cached.cachedAt);
    return age <= OFFLINE_SESSION_TRUST_MS ? cached : undefined;
  } catch (err) {
    console.error("[auth] Failed to read the cached offline user:", err);
    return undefined;
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUserId: null,
  currentRole: null,
  adminVerified: false,
  hasTotp: false,
  isAuthLoading: true,

  restoreSession: async () => {
    // getSession() reads the already-persisted Supabase session locally —
    // no network needed for this part even when offline.
    const { data } = await supabase.auth.getSession();
    const authUser = data.session?.user;
    if (!authUser) {
      set({ currentUserId: null, currentRole: null, adminVerified: false, hasTotp: false, isAuthLoading: false });
      return;
    }

    let result: ResolveResult;
    try {
      result = await resolveAppUser({ id: authUser.id, email: authUser.email ?? undefined });
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }

    let user = result.user;
    let fromCache = false;
    let cachedHasTotp = false;

    // A valid Supabase session exists but we couldn't reach `users` to
    // confirm the role/active flag — fall back to the last-known-good
    // resolution instead of treating this as "not logged in" (that would
    // log a cashier out of an otherwise fully offline-capable till). A
    // genuine, non-network error (e.g. RLS/data problem) still logs the
    // failure and does NOT fall back, since that's not a connectivity issue.
    if (!user && result.error) {
      if (isNetworkError(result.error)) {
        const cached = await getCachedAppUser(authUser.id);
        if (cached) {
          user = { id: cached.userId, role: cached.role, shop_id: cached.shopId, is_active: cached.isActive, auth_id: authUser.id };
          fromCache = true;
          cachedHasTotp = cached.hasTotp;
        }
      } else {
        console.error("[auth] restoreSession:", result.error);
      }
    }

    const active = Boolean(user && user.is_active);
    const isAdmin = active && user!.role === "ADMIN";
    // Offline, there's no way to reach Supabase's MFA endpoints to confirm a
    // fresh aal2 step-up — reuse the last-known hasTotp and rely on
    // isVerifiedThisSession() below (this session's own prior verification,
    // if any) rather than claiming a step-up that didn't happen.
    const { hasTotp, isAal2 } = !isAdmin
      ? { hasTotp: false, isAal2: false }
      : fromCache
        ? { hasTotp: cachedHasTotp, isAal2: false }
        : await readMfaState();
    set({
      currentUserId: active ? user!.id : null,
      currentRole: active ? user!.role : null,
      hasTotp,
      // Admin is verified if the session is aal2 (TOTP) or the email flag is set.
      adminVerified: isAdmin ? isAal2 || isVerifiedThisSession(authUser.id) : true,
      isAuthLoading: false,
    });

    if (user && !fromCache) void cacheAppUser(authUser.id, user, hasTotp);
  },

  login: async (email, password) => {
    let authResult = await supabase.auth.signInWithPassword({ email, password });

    if (authResult.error) {
      // Allow signup only for the very first user (empty users table).
      const { data: anyUser } = await supabase.from("users").select("id").limit(1);
      const isFirstSetup = !anyUser || anyUser.length === 0;
      if (!isFirstSetup) return { error: "Invalid email or password." };

      const signUp = await supabase.auth.signUp({ email, password });
      if (signUp.error) return { error: signUp.error.message };
      authResult = await supabase.auth.signInWithPassword({ email, password });
      if (authResult.error) return { error: authResult.error.message };
    }

    const authUser = authResult.data.user;
    if (!authUser) return { error: "Authentication failed." };

    const result = await resolveAppUser({ id: authUser.id, email: authUser.email ?? undefined });
    if (result.error) {
      await supabase.auth.signOut();
      return { error: result.error };
    }

    // No app `users` row linked to this auth account.
    if (!result.user) {
      const { data: anyUser } = await supabase.from("users").select("id").limit(1);
      const tableEmpty = !anyUser || anyUser.length === 0;
      if (!tableEmpty) {
        // Orphan auth account — a staff profile must be created/linked by an admin.
        await supabase.auth.signOut();
        return { error: "No staff profile is linked to this account. Contact an administrator." };
      }
      // First-time setup: create the first ADMIN, linked by auth_id from the start.
      const normalizedEmail = email.trim().toLowerCase();
      const adminId = `user-${normalizedEmail.replace(/[^a-z0-9]/gi, "-")}`;
      const adminName = normalizedEmail.split("@")[0]?.replace(/[^a-z0-9]/gi, " ").trim() || "Admin";
      const insert = await supabase.from("users").insert({
        id: adminId,
        name: adminName,
        email: normalizedEmail,
        role: "ADMIN",
        auth_id: authUser.id,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      if (insert.error) {
        await supabase.auth.signOut();
        return { error: insert.error.message };
      }
      // First admin must still verify (no factor yet → email path).
      set({ currentUserId: adminId, currentRole: "ADMIN", adminVerified: false, hasTotp: false });
      void cacheAppUser(authUser.id, { id: adminId, role: "ADMIN", shop_id: null, is_active: true, auth_id: authUser.id }, false);
      return { error: null, role: "ADMIN" };
    }

    const user = result.user;
    if (!user.is_active) {
      await supabase.auth.signOut();
      return { error: "Account is inactive. Contact your administrator." };
    }

    const isAdmin = user.role === "ADMIN";
    const { hasTotp, isAal2 } = isAdmin ? await readMfaState() : { hasTotp: false, isAal2: false };
    set({
      currentUserId: user.id,
      currentRole: user.role,
      hasTotp,
      adminVerified: isAdmin ? isAal2 || isVerifiedThisSession(authUser.id) : true,
    });
    void cacheAppUser(authUser.id, user, hasTotp);
    return { error: null, role: user.role, shopId: user.shop_id ?? undefined };
  },

  logout: async () => {
    const { data } = await supabase.auth.getSession();
    const authId = data.session?.user.id;
    await supabase.auth.signOut();
    clearVerified();
    if (authId) void localDb.authCache.delete(authId);
    set({ currentUserId: null, currentRole: null, adminVerified: false, hasTotp: false });
  },

  requestAdminCode: async () => {
    const { error, data } = await invokeAdmin2fa({ action: "request" });
    if (error) return { error };
    return {
      error: null,
      expiresAt: typeof data?.expiresAt === "string" ? data.expiresAt : undefined,
      email: typeof data?.email === "string" ? data.email : undefined,
    };
  },

  verifyAdminCode: async (code: string) => {
    const { error, data } = await invokeAdmin2fa({ action: "verify", code });
    if (error) return { error };
    if (!data?.verified) return { error: "Verification failed. Try again." };
    const { data: sessionData } = await supabase.auth.getSession();
    const authId = sessionData.session?.user.id;
    if (authId) markVerified(authId);
    set({ adminVerified: true });
    return { error: null };
  },

  listTotpFactors: listTotpFactorRows,

  // Start TOTP enrollment: returns the QR + secret to show the admin.
  // `issuer` is the label authenticator apps show as the account title — set it
  // to the brand so the entry reads "Shwe PhaLar", not the site URL.
  enrollTotp: async (friendlyName?: string) => {
    const name = friendlyName?.trim();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      issuer: "Shwe PhaLar",
      ...(name ? { friendlyName: name } : {}),
    });
    if (error) return { error: error.message };
    return {
      error: null,
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    };
  },

  // Confirm enrollment with the first app code; success upgrades the session
  // to aal2 and marks the admin verified for this session.
  verifyTotpEnrollment: async (factorId: string, code: string) => {
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) return { error: challenge.error.message };
    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verify.error) return { error: verify.error.message };
    set({ adminVerified: true, hasTotp: true });
    return { error: null };
  },

  // Step up an existing verified factor at login time.
  verifyTotpLogin: async (code: string) => {
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) return { error: listError.message };
    const verifiedFactors = (factors?.totp ?? []).filter((f) => f.status === "verified");
    if (verifiedFactors.length === 0) return { error: "No authenticator app is set up." };

    let lastError = "Incorrect code. Check your authenticator app and try again.";
    for (const factor of verifiedFactors) {
      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error) {
        lastError = challenge.error.message;
        continue;
      }
      const verify = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code,
      });
      if (!verify.error) {
        set({ adminVerified: true });
        return { error: null };
      }
      lastError = verify.error.message || lastError;
    }
    return { error: lastError };
  },

  unenrollTotp: async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return { error: error.message };
    const { factors } = await listTotpFactorRows();
    set({ hasTotp: factors.some((factor) => factor.status === "verified") });
    return { error: null };
  },
}));
