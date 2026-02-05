import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  currentShopId: string | null;
  setShopId: (shopId: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentShopId: null,
      setShopId: (shopId) => set({ currentShopId: shopId }),
    }),
    { name: "pos-app" }
  )
);
