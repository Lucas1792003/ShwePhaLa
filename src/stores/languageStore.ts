import { create } from "zustand";
import { persist } from "zustand/middleware";
import { detectZawgyiSystem } from "../lib/zawgyi";

export type Language = "en" | "my";

interface LanguageState {
  language: Language;
  isZawgyi: boolean;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "en",
      isZawgyi: detectZawgyiSystem(),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "pos-language",
      // Never persist isZawgyi — always detect fresh from system
      partialize: (state) => ({ language: state.language }),
    }
  )
);
