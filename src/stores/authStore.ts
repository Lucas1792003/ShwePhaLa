import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  currentUserId: string | null;
  login: (userId: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUserId: null,
      login: (userId) => set({ currentUserId: userId }),
      logout: () => set({ currentUserId: null }),
    }),
    { name: "pos-auth" }
  )
);
