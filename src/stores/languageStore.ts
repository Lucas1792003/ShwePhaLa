import { create } from "zustand";
import { persist } from "zustand/middleware";
import { detectZawgyiSystem } from "../lib/zawgyi";

export type Language = "en" | "my";

interface LanguageState {
  language: Language;
  isZawgyi: boolean;
  setLanguage: (language: Language) => void;
  setZawgyi: (isZawgyi: boolean) => void;
}

const systemZawgyi = detectZawgyiSystem();

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: systemZawgyi ? "my" : "en",
      isZawgyi: systemZawgyi,
      setLanguage: (language) => set({ language }),
      setZawgyi: (isZawgyi) => set({ isZawgyi }),
    }),
    {
      name: "pos-language",
      version: 1,
      partialize: (state) => ({ language: state.language, isZawgyi: state.isZawgyi }),
    }
  )
);
