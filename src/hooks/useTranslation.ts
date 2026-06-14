import { useLanguageStore, type Language } from "../stores/languageStore";
import { getTranslation } from "../i18n/translations";
import { unicodeToZawgyi } from "../lib/zawgyi";

interface UseTranslationReturn {
  t: (section: string, key: string, vars?: Record<string, string | number>) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
  isZawgyi: boolean;
}

export const useTranslation = (): UseTranslationReturn => {
  const { language, setLanguage, isZawgyi } = useLanguageStore();

  // `vars` substitutes `{name}`-style placeholders in the template, so
  // sentences with runtime values keep correct word order per language.
  const t = (section: string, key: string, vars?: Record<string, string | number>): string => {
    let text = getTranslation(language, section, key);
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    if (language === "my" && isZawgyi) {
      return unicodeToZawgyi(text);
    }
    return text;
  };

  return { t, language, setLanguage, isZawgyi };
};
