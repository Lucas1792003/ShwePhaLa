import { create } from "zustand";
import { supabase } from "../lib/supabase";

interface LoginResult {
  error: string | null;
  role?: string;
  shopId?: string;
}

interface AuthState {
  currentUserId: string | null;
  isAuthLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
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
  isAuthLoading: true,

  restoreSession: async () => {
    const { data } = await supabase.auth.getSession();
    const authUser = data.session?.user;
    if (!authUser) {
      set({ currentUserId: null, isAuthLoading: false });
      return;
    }
    const result = await resolveAppUser({ id: authUser.id, email: authUser.email ?? undefined });
    if (result.error) console.error("[auth] restoreSession:", result.error);
    const user = result.user;
    set({
      currentUserId: user && user.is_active ? user.id : null,
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
      set({ currentUserId: adminId });
      return { error: null, role: "ADMIN" };
    }

    const user = result.user;
    if (!user.is_active) {
      await supabase.auth.signOut();
      return { error: "Account is inactive. Contact your administrator." };
    }

    set({ currentUserId: user.id });
    return { error: null, role: user.role, shopId: user.shop_id ?? undefined };
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ currentUserId: null });
  },
}));
