import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const systemPrefersDark =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: systemPrefersDark ? "dark" : "light",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
    }),
    {
      name: "pos-theme",
      version: 1,
    },
  ),
);

// Keeps <html>'s "dark" class (which Tailwind's darkMode:"class" and our own
// .dark CSS-variable overrides key off) and the color-scheme CSS property
// (native form controls/scrollbars) in sync with the store — applied once on
// module load (before React mounts, since this is imported early in
// main.tsx) and again on every future change, so no component needs to wire
// this up itself.
const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
};

applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));
