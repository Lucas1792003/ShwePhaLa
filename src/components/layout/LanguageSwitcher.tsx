import { useLanguageStore } from "../../stores/languageStore";
import { cn } from "../../lib/utils";

interface LanguageSwitcherProps {
  className?: string;
}

export const LanguageSwitcher = ({ className }: LanguageSwitcherProps) => {
  const { language, setLanguage } = useLanguageStore();

  return (
    <div className={cn("flex items-center gap-1 rounded-lg bg-slate-100 p-1", className)}>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        className={cn(
          "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
          language === "en"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("my")}
        className={cn(
          "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
          language === "my"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-700"
        )}
      >
        မြန်မာ
      </button>
    </div>
  );
};
