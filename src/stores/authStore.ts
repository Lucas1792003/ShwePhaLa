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

export const useAuthStore = create<AuthState>()((set) => ({
  currentUserId: null,
  isAuthLoading: true,

  restoreSession: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.email) {
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", data.session.user.email)
        .single();
      if (user) {
        set({ currentUserId: user.id, isAuthLoading: false });
        return;
      }
    }
    set({ isAuthLoading: false });
  },

  login: async (email, password) => {
    // Try sign in first
    let authResult = await supabase.auth.signInWithPassword({ email, password });

    if (authResult.error) {
      // Only allow signup if this is the very first user (empty database)
      const { data: anyUser } = await supabase.from("users").select("id").limit(1);
      const isFirstSetup = !anyUser || anyUser.length === 0;

      if (!isFirstSetup) {
        return { error: "Invalid email or password." };
      }

      // First-time setup: create the admin account
      const signUpResult = await supabase.auth.signUp({ email, password });
      if (signUpResult.error) return { error: signUpResult.error.message };

      authResult = await supabase.auth.signInWithPassword({ email, password });
      if (authResult.error) return { error: authResult.error.message };
    }

    // Look up user record in our users table
    const { data: user } = await supabase
      .from("users")
      .select("id, role, shop_id")
      .eq("email", email)
      .single();

    if (!user) {
      // First-time setup: create the first admin record
      const adminId = `user-${email.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
      const adminName = email.split("@")[0]?.replace(/[^a-z0-9]/gi, " ").trim() || "Admin";
      await supabase.from("users").insert({
        id: adminId,
        name: adminName,
        email,
        role: "ADMIN",
        is_active: true,
        created_at: new Date().toISOString(),
      });
      set({ currentUserId: adminId });
      return { error: null, role: "ADMIN" };
    }

    if (!user.role || !(await isUserActive(user.id))) {
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

async function isUserActive(userId: string): Promise<boolean> {
  const { data } = await supabase.from("users").select("is_active").eq("id", userId).single();
  return data?.is_active ?? false;
}
