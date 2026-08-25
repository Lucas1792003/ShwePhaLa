import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

interface ThemeState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const themeOrder: ThemePreference[] = ["system", "light", "dark"];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const currentIndex = themeOrder.indexOf(get().theme);
        set({ theme: themeOrder[(currentIndex + 1) % themeOrder.length] });
      },
    }),
    {
      name: "pos-theme",
      version: 2,
      // v1 stored only light/dark. Those values represent an existing user
      // choice, so preserve them; new installs now start on system.
      migrate: (persisted) => persisted as ThemeState,
    },
  ),
);

// Keeps <html>'s "dark" class (which Tailwind's darkMode:"class" and our own
// .dark CSS-variable overrides key off) and the color-scheme CSS property
// (native form controls/scrollbars) in sync with the resolved preference.
const resolveTheme = (preference: ThemePreference): Theme => {
  if (preference !== "system") return preference;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const applyTheme = (preference: ThemePreference) => {
  if (typeof document === "undefined") return;
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
};

applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));

// A real system preference follows OS changes while the app is open. Explicit
// light/dark choices ignore this event until the user returns to System.
if (typeof window !== "undefined" && window.matchMedia) {
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  systemTheme.addEventListener("change", () => {
    if (useThemeStore.getState().theme === "system") applyTheme("system");
  });
}
