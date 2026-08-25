import { useThemeStore } from "../../stores/themeStore";
import { cn } from "../../lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const { theme, toggleTheme } = useThemeStore();
  const themeMeta = {
    system: { icon: "brightness_auto", next: "light", label: "System theme" },
    light: { icon: "light_mode", next: "dark", label: "Light theme" },
    dark: { icon: "dark_mode", next: "system", label: "Dark theme" },
  } as const;
  const current = themeMeta[theme];
  const actionLabel = `${current.label}. Switch to ${current.next} theme`;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "flex items-center justify-center rounded-md p-1.5 text-slate-500 transition-all hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
        className,
      )}
      title={actionLabel}
      aria-label={actionLabel}
    >
      <span className="material-symbols-rounded text-lg">{current.icon}</span>
    </button>
  );
};
