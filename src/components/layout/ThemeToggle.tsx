import { useThemeStore } from "../../stores/themeStore";
import { cn } from "../../lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "flex items-center justify-center rounded-md p-1.5 text-slate-500 transition-all hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
        className,
      )}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="material-symbols-rounded text-lg">{isDark ? "light_mode" : "dark_mode"}</span>
    </button>
  );
};
