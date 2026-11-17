import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLanguage = 'en' | 'bn';

const STORAGE_KEY_LANG = '@app_language_v1';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  toggleLanguage: () => Promise<void>;
  isBangla: boolean;
  t: (en: string, bn: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: async () => {},
  toggleLanguage: async () => {},
  isBangla: false,
  t: (en) => en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Default language is English ('en')
  const [language, setLanguageState] = useState<AppLanguage>('en');

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY_LANG)
      .then((saved) => {
        if (mounted && (saved === 'en' || saved === 'bn')) {
          setLanguageState(saved);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANG, lang);
    } catch {}
  }, []);

  const toggleLanguage = useCallback(async () => {
    const next: AppLanguage = language === 'en' ? 'bn' : 'en';
    await setLanguage(next);
  }, [language, setLanguage]);

  const t = useCallback(
    (en: string, bn: string) => (language === 'bn' ? bn : en),
    [language]
  );

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        toggleLanguage,
        isBangla: language === 'bn',
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
