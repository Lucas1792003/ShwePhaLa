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
      // Bumped 1 -> 2: detectZawgyiSystem() previously false-flagged modern
      // systems (Myanmar3 is a Unicode font, not a Zawgyi indicator — see
      // lib/zawgyi.ts) as needing Zawgyi, and that wrong value then stuck
      // around forever via persistence. No migrate fn means a version
      // mismatch just re-runs the (now-fixed) fresh detection instead of
      // carrying the bad cached value over.
      version: 2,
      partialize: (state) => ({ language: state.language, isZawgyi: state.isZawgyi }),
    }
  )
);
