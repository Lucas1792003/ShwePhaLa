import { create } from "zustand";
import { supabase } from "../lib/supabase";

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

interface AuthState {
  currentUserId: string | null;
  // Role of the signed-in user, captured at login/restore so route guards can
  // gate the admin email-code step before the data store's users are loaded.
  currentRole: string | null;
  // True once an ADMIN has passed the email-code step this browser session.
  // Always true for non-admins (the step doesn't apply to them).
  adminVerified: boolean;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  // Admin 2FA: email a fresh code, then verify the submitted code.
  requestAdminCode: () => Promise<RequestCodeResult>;
  verifyAdminCode: (code: string) => Promise<{ error: string | null }>;
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

export const useAuthStore = create<AuthState>()((set) => ({
  currentUserId: null,
  currentRole: null,
  adminVerified: false,
  isAuthLoading: true,

  restoreSession: async () => {
    const { data } = await supabase.auth.getSession();
    const authUser = data.session?.user;
    if (!authUser) {
      set({ currentUserId: null, currentRole: null, adminVerified: false, isAuthLoading: false });
      return;
    }
    const result = await resolveAppUser({ id: authUser.id, email: authUser.email ?? undefined });
    if (result.error) console.error("[auth] restoreSession:", result.error);
    const user = result.user;
    const active = Boolean(user && user.is_active);
    set({
      currentUserId: active ? user!.id : null,
      currentRole: active ? user!.role : null,
      // Admins must have verified this session; everyone else is exempt.
      adminVerified: active && user!.role === "ADMIN" ? isVerifiedThisSession(authUser.id) : true,
      isAuthLoading: false,
    });
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
      // First admin must still pass the email-code step.
      set({ currentUserId: adminId, currentRole: "ADMIN", adminVerified: false });
      return { error: null, role: "ADMIN" };
    }

    const user = result.user;
    if (!user.is_active) {
      await supabase.auth.signOut();
      return { error: "Account is inactive. Contact your administrator." };
    }

    set({
      currentUserId: user.id,
      currentRole: user.role,
      adminVerified: user.role === "ADMIN" ? isVerifiedThisSession(authUser.id) : true,
    });
    return { error: null, role: user.role, shopId: user.shop_id ?? undefined };
  },

  logout: async () => {
    await supabase.auth.signOut();
    clearVerified();
    set({ currentUserId: null, currentRole: null, adminVerified: false });
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
}));
