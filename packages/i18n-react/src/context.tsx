import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  Translator,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  resolveSupportedLocale,
  isRtlLocale,
} from '@gigalibs/i18n';

export interface I18nContextValue {
  locale: string;
  direction: 'ltr' | 'rtl';
  isRtl: boolean;
  supportedLocales: SupportedLocale[];
  currentLocaleMeta: SupportedLocale;
  setLocale: (locale: string) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  initialLocale?: string;
  children: React.ReactNode;
  onLocaleChange?: (locale: string) => void;
  forcedLocale?: string; // e.g. 'en-US' for platform admin
}

export function I18nProvider({
  initialLocale = 'en-US',
  forcedLocale,
  children,
  onLocaleChange,
}: I18nProviderProps): React.JSX.Element {
  const [activeLocale, setActiveLocaleState] = useState<string>(() => {
    return forcedLocale || initialLocale || 'en-US';
  });

  const effectiveLocale = forcedLocale || activeLocale;
  const translator = useMemo(() => new Translator({ defaultLocale: effectiveLocale }), [effectiveLocale]);

  const currentLocaleMeta = useMemo(() => resolveSupportedLocale(effectiveLocale), [effectiveLocale]);
  const isRtl = useMemo(() => isRtlLocale(effectiveLocale), [effectiveLocale]);
  const direction: 'ltr' | 'rtl' = isRtl ? 'rtl' : 'ltr';

  const setLocale = (newLocale: string) => {
    if (forcedLocale) {
      // If locale is strictly forced (e.g. Platform Admin), ignore overrides
      return;
    }
    const resolved = resolveSupportedLocale(newLocale);
    setActiveLocaleState(resolved.code);
    translator.setLocale(resolved.code);
    onLocaleChange?.(resolved.code);
  };

  // Sync document direction and lang attribute when in browser
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = effectiveLocale;
      document.documentElement.dir = direction;
    }
  }, [effectiveLocale, direction]);

  const contextValue = useMemo<I18nContextValue>(() => {
    return {
      locale: effectiveLocale,
      direction,
      isRtl,
      supportedLocales: SUPPORTED_LOCALES,
      currentLocaleMeta,
      setLocale,
      t: (key: string, variables?: Record<string, string | number>) => {
        return translator.t(key, variables, effectiveLocale);
      },
    };
  }, [effectiveLocale, direction, isRtl, currentLocaleMeta, translator]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    const fallback = new Translator({ defaultLocale: 'en-US' });
    return {
      locale: 'en-US',
      direction: 'ltr',
      isRtl: false,
      supportedLocales: SUPPORTED_LOCALES,
      currentLocaleMeta: SUPPORTED_LOCALES[0]!,
      setLocale: () => {},
      t: (key: string, vars?: Record<string, string | number>) => fallback.t(key, vars, 'en-US'),
    };
  }
  return ctx;
}

export function useTranslation(namespace?: string): {
  t: (key: string, variables?: Record<string, string | number>) => string;
  locale: string;
  direction: 'ltr' | 'rtl';
  isRtl: boolean;
  setLocale: (locale: string) => void;
} {
  const { t: baseT, locale, direction, isRtl, setLocale } = useI18n();

  const t = useMemo(() => {
    return (key: string, variables?: Record<string, string | number>) => {
      if (namespace && !key.includes('.')) {
        // First try namespaced key e.g. "navigation.dashboard"
        const namespacedKey = `${namespace}.${key}`;
        const translated = baseT(namespacedKey, variables);
        if (translated !== key && translated !== namespacedKey) {
          return translated;
        }
      }
      return baseT(key, variables);
    };
  }, [baseT, namespace]);

  return { t, locale, direction, isRtl, setLocale };
}

export function useLocale(): {
  locale: string;
  direction: 'ltr' | 'rtl';
  isRtl: boolean;
  setLocale: (locale: string) => void;
  supportedLocales: SupportedLocale[];
  currentLocaleMeta: SupportedLocale;
} {
  const { locale, direction, isRtl, setLocale, supportedLocales, currentLocaleMeta } = useI18n();
  return { locale, direction, isRtl, setLocale, supportedLocales, currentLocaleMeta };
}
