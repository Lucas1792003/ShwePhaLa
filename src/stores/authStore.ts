import { create } from "zustand";
import { supabase } from "../lib/supabase";
import { getRoleFromEmail } from "../features/auth/authTypes";

interface AuthState {
  currentUserId: string | null;
  isAuthLoading: boolean;
  login: (email: string, password: string, shopId?: string) => Promise<string | null>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUserId: null,
  isAuthLoading: true,

  restoreSession: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.email) {
      const email = data.session.user.email;
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .single();
      if (user) {
        set({ currentUserId: user.id, isAuthLoading: false });
        return;
      }
    }
    set({ isAuthLoading: false });
  },

  login: async (email: string, password: string, shopId?: string) => {
    const role = getRoleFromEmail(email);
    if (!role) {
      return "Use @admin.com, @manager.com, @staff.com, or @buyer.com email.";
    }

    // Try sign in first, auto-sign-up on first login
    let authResult = await supabase.auth.signInWithPassword({ email, password });
    if (authResult.error?.message?.includes("Invalid login credentials")) {
      const signUpResult = await supabase.auth.signUp({ email, password });
      if (signUpResult.error) return signUpResult.error.message;
      authResult = await supabase.auth.signInWithPassword({ email, password });
    }
    if (authResult.error) return authResult.error.message;

    // Find or create user record in users table
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      set({ currentUserId: existingUser.id });
      return null;
    }

    // Create new user record
    const userId = `user-${email.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
    const name = email.split("@")[0]?.replace(/[^a-z0-9]/gi, " ").trim() || "Staff";
    const requiresShop = role === "MANAGER" || role === "CASHIER";
    await supabase.from("users").insert({
      id: userId,
      name,
      email,
      role,
      shop_id: requiresShop ? shopId : null,
      is_active: true,
      created_at: new Date().toISOString(),
    });

    set({ currentUserId: userId });
    return null;
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ currentUserId: null });
  },
}));
