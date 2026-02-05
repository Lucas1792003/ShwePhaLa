import { useLanguageStore, type Language } from "../stores/languageStore";
import { getTranslation } from "../i18n/translations";

interface UseTranslationReturn {
  t: (section: string, key: string) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useTranslation = (): UseTranslationReturn => {
  const { language, setLanguage } = useLanguageStore();

  const t = (section: string, key: string): string => {
    return getTranslation(language, section, key);
  };

  return { t, language, setLanguage };
};
