import { useMemo } from 'react';

import { getTranslation, type Language } from './translations';
import { useUiPreferencesStore } from '../stores/uiPreferencesStore';

type TranslationValues = Record<string, string | number>;

export function useTranslation() {
  const language = useUiPreferencesStore((store) => store.language);
  const setLanguage = useUiPreferencesStore((store) => store.setLanguage);

  const t = useMemo(() => {
    return (key: string, values?: TranslationValues) => getTranslation(language as Language, key, values);
  }, [language]);

  return { language, setLanguage, t };
}
