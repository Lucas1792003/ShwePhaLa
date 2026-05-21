import { useLanguageStore, type Language } from "../stores/languageStore";
import { getTranslation } from "../i18n/translations";
import { unicodeToZawgyi } from "../lib/zawgyi";

interface UseTranslationReturn {
  t: (section: string, key: string) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
  isZawgyi: boolean;
}

export const useTranslation = (): UseTranslationReturn => {
  const { language, setLanguage, isZawgyi } = useLanguageStore();

  const t = (section: string, key: string): string => {
    const text = getTranslation(language, section, key);
    if (language === "my" && isZawgyi) {
      return unicodeToZawgyi(text);
    }
    return text;
  };

  return { t, language, setLanguage, isZawgyi };
};
