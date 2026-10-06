'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CurrencyPair, formatCurrencyAmount, requestCurrency, TenantPreferences } from '@/lib/currency-api';

export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'CHF' | 'AUD' | 'INR' | 'SGD';
export type SupportedLocale = 'en-US' | 'de-DE' | 'ja-JP' | 'fr-FR' | 'en-GB' | 'en-IN' | 'en-CA' | 'en-AU' | 'de-CH' | 'en-SG';

export interface CountryDetails {
  countryCode: string;
  countryName: string;
  flag: string;
  currency: SupportedCurrency;
  currencySymbol: string;
  locale: SupportedLocale;
  localeLabel: string;
}

export const COUNTRY_DATA: Record<SupportedCurrency, CountryDetails> = {
  INR: { countryCode: 'IN', countryName: 'India', flag: '🇮🇳', currency: 'INR', currencySymbol: '₹', locale: 'en-IN', localeLabel: 'English (India)' },
  JPY: { countryCode: 'JP', countryName: 'Japan', flag: '🇯🇵', currency: 'JPY', currencySymbol: '¥', locale: 'ja-JP', localeLabel: '日本語 (Japan)' },
  USD: { countryCode: 'US', countryName: 'United States', flag: '🇺🇸', currency: 'USD', currencySymbol: '$', locale: 'en-US', localeLabel: 'English (US)' },
  GBP: { countryCode: 'GB', countryName: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', currencySymbol: '£', locale: 'en-GB', localeLabel: 'English (UK)' },
  EUR: { countryCode: 'EU', countryName: 'Eurozone (Germany)', flag: '🇪🇺', currency: 'EUR', currencySymbol: '€', locale: 'de-DE', localeLabel: 'Deutsch (DE)' },
  CAD: { countryCode: 'CA', countryName: 'Canada', flag: '🇨🇦', currency: 'CAD', currencySymbol: 'CA$', locale: 'en-CA', localeLabel: 'English (Canada)' },
  AUD: { countryCode: 'AU', countryName: 'Australia', flag: '🇦🇺', currency: 'AUD', currencySymbol: 'A$', locale: 'en-AU', localeLabel: 'English (Australia)' },
  CHF: { countryCode: 'CH', countryName: 'Switzerland', flag: '🇨🇭', currency: 'CHF', currencySymbol: 'CHF', locale: 'de-CH', localeLabel: 'Deutsch (Schweiz)' },
  SGD: { countryCode: 'SG', countryName: 'Singapore', flag: '🇸🇬', currency: 'SGD', currencySymbol: 'S$', locale: 'en-SG', localeLabel: 'English (Singapore)' },
};

export const CURRENCY_TO_LOCALE_MAP: Record<SupportedCurrency, SupportedLocale> = {
  INR: 'en-IN',
  JPY: 'ja-JP',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'de-DE',
  CAD: 'en-CA',
  AUD: 'en-AU',
  CHF: 'de-CH',
  SGD: 'en-SG',
};

export const LOCALE_TO_CURRENCY_MAP: Record<SupportedLocale, SupportedCurrency> = {
  'en-IN': 'INR',
  'ja-JP': 'JPY',
  'en-US': 'USD',
  'en-GB': 'GBP',
  'de-DE': 'EUR',
  'fr-FR': 'EUR',
  'en-CA': 'CAD',
  'en-AU': 'AUD',
  'de-CH': 'CHF',
  'en-SG': 'SGD',
};

interface CurrencyLocaleContextType {
  currency: SupportedCurrency;
  locale: SupportedLocale;
  setCurrency: (currency: SupportedCurrency) => void;
  setLocale: (locale: SupportedLocale) => void;
  setCountryAndCurrency: (currency: SupportedCurrency, locale?: SupportedLocale) => void;
  rates: CurrencyPair[];
  formatMoney: (amountMinor: number, overrideCurrency?: string) => string;
  convert: (amountMinor: number, fromCurrency: string, toCurrency?: string) => number;
  t: (key: string) => string;
  isLoading: boolean;
}

const BASE_EN_DICTIONARY = {
  'platform.title': 'Operations Engine',
  'common.search': 'Search modules...',
  'common.refresh': 'Refresh',
  'common.active': 'Active',
  'common.status': 'Status',
  'common.currency': 'Currency',
  'common.language': 'Language',
  'currency.engine': 'MultiCurrency & Global Treasury',
  'data.title': 'Universal Data Studio',
  'data.subtitle': 'Data Contract Lifecycle, Schema Drift Monitoring & Source Mapping',
  'ar.title': 'Enterprise Invoicing & WIP Studio',
  'spend.title': 'Spend Management & AP Automation',
};

const DICTIONARY: Record<SupportedLocale, Record<string, string>> = {
  'en-US': BASE_EN_DICTIONARY,
  'en-GB': BASE_EN_DICTIONARY,
  'en-IN': BASE_EN_DICTIONARY,
  'en-CA': BASE_EN_DICTIONARY,
  'en-AU': BASE_EN_DICTIONARY,
  'en-SG': BASE_EN_DICTIONARY,
  'de-DE': {
    'platform.title': 'Betriebsmotor',
    'common.search': 'Module durchsuchen...',
    'common.refresh': 'Aktualisieren',
    'common.active': 'Aktiv',
    'common.status': 'Status',
    'common.currency': 'Währung',
    'common.language': 'Sprache',
    'currency.engine': 'Mehrwährungs- & Finanzverwaltung',
    'data.title': 'Universelles Datenstudio',
    'data.subtitle': 'Datenvertragslebenszyklus, Schema-Überwachung & Quellenzuordnung',
    'ar.title': 'Unternehmensfakturierung & WIP-Studio',
    'spend.title': 'Ausgabenverwaltung & Kreditorenbuchhaltung',
  },
  'de-CH': {
    'platform.title': 'Betriebsmotor',
    'common.search': 'Module durchsuchen...',
    'common.refresh': 'Aktualisieren',
    'common.active': 'Aktiv',
    'common.status': 'Status',
    'common.currency': 'Währung',
    'common.language': 'Sprache',
    'currency.engine': 'Mehrwährungs- & Finanzverwaltung',
    'data.title': 'Universelles Datenstudio',
    'data.subtitle': 'Datenvertragslebenszyklus, Schema-Überwachung & Quellenzuordnung',
    'ar.title': 'Unternehmensfakturierung & WIP-Studio',
    'spend.title': 'Ausgabenverwaltung & Kreditorenbuchhaltung',
  },
  'ja-JP': {
    'platform.title': 'オペレーションエンジン',
    'common.search': 'モジュールを検索...',
    'common.refresh': '更新',
    'common.active': '有効',
    'common.status': 'ステータス',
    'common.currency': '通貨',
    'common.language': '言語',
    'currency.engine': '複数通貨・グローバル財務エンジン',
    'data.title': 'ユニバーサルデータスタジオ',
    'data.subtitle': 'データ契約ライフサイクル、スキーマドリフト監視とマッピング',
    'ar.title': '企業請求＆WIPスタジオ',
    'spend.title': '支出管理＆AP自動化',
  },
  'fr-FR': {
    'platform.title': 'Moteur Opérationnel',
    'common.search': 'Rechercher des modules...',
    'common.refresh': 'Actualiser',
    'common.active': 'Actif',
    'common.status': 'Statut',
    'common.currency': 'Devise',
    'common.language': 'Langue',
    'currency.engine': 'Moteur Multi-Devises et Trésorerie',
    'data.title': 'Studio de Données Universel',
    'data.subtitle': 'Cycle de vie des contrats de données, dérive de schéma & cartographie',
    'ar.title': 'Facturation d\'Entreprise & Studio WIP',
    'spend.title': 'Gestion des Dépenses & Automatisation AP',
  },
};

const CurrencyLocaleContext = createContext<CurrencyLocaleContextType | undefined>(undefined);

/**
 * WI-OI-120n: `enabled` is false when the workspace does not have Multi-Currency or the person may not read it; the
 * provider then keeps its defaults and the person's choices in the page, and makes no Currency calls (a trial
 * workspace otherwise sent two refused calls from every page).
 */
export function CurrencyLocaleProvider({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const [currency, setCurrencyState] = useState<SupportedCurrency>('USD');
  const [locale, setLocaleState] = useState<SupportedLocale>('en-US');
  const [rates, setRates] = useState<CurrencyPair[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);

  const loadPreferencesAndRates = useCallback(async () => {
    if (!enabled) return;
    try {
      setIsLoading(true);
      const [pairsData, prefsData] = await Promise.all([
        requestCurrency<CurrencyPair[]>('v1/pairs').catch(() => []),
        requestCurrency<TenantPreferences>('v1/preferences').catch(() => null),
      ]);

      if (pairsData && pairsData.length > 0) {
        setRates(pairsData);
      }
      if (prefsData) {
        if (prefsData.presentationCurrency) {
          const presCurr = prefsData.presentationCurrency as SupportedCurrency;
          setCurrencyState(presCurr);
          if (prefsData.defaultLocale) {
            setLocaleState(prefsData.defaultLocale as SupportedLocale);
          } else if (CURRENCY_TO_LOCALE_MAP[presCurr]) {
            setLocaleState(CURRENCY_TO_LOCALE_MAP[presCurr]);
          }
        } else if (prefsData.defaultLocale) {
          setLocaleState(prefsData.defaultLocale as SupportedLocale);
        }
      }
    } catch {
      // Keep fallbacks
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadPreferencesAndRates();
  }, [loadPreferencesAndRates]);

  /** Saves the presentation preference to Currency, when the workspace has it. */
  const savePreference = (body: Record<string, string>) => {
    if (!enabled) return;
    void requestCurrency('v1/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  };

  // Synchronized Currency & Country/Locale: setting currency also aligns country locale in parallel
  const setCurrency = (newCurrency: SupportedCurrency) => {
    const linkedLocale = CURRENCY_TO_LOCALE_MAP[newCurrency] || 'en-US';
    setCurrencyState(newCurrency);
    setLocaleState(linkedLocale);
    savePreference({ presentationCurrency: newCurrency, defaultLocale: linkedLocale });
  };

  // Synchronized Country/Locale & Currency: setting locale also aligns presentation currency in parallel
  const setLocale = (newLocale: SupportedLocale) => {
    const linkedCurrency = LOCALE_TO_CURRENCY_MAP[newLocale] || 'USD';
    setLocaleState(newLocale);
    setCurrencyState(linkedCurrency);
    savePreference({ defaultLocale: newLocale, presentationCurrency: linkedCurrency });
  };

  const setCountryAndCurrency = (newCurrency: SupportedCurrency, newLocale?: SupportedLocale) => {
    const targetLocale = newLocale || CURRENCY_TO_LOCALE_MAP[newCurrency] || 'en-US';
    setCurrencyState(newCurrency);
    setLocaleState(targetLocale);
    savePreference({ presentationCurrency: newCurrency, defaultLocale: targetLocale });
  };

  const convert = useCallback(
    (amountMinor: number, fromCurrency: string, toCurrency?: string): number => {
      const target = toCurrency || currency;
      const from = fromCurrency.toUpperCase();
      const to = target.toUpperCase();
      if (from === to) return amountMinor;

      const direct = rates.find((r) => r.baseCurrency === from && r.targetCurrency === to);
      if (direct) {
        return Math.round((amountMinor * direct.rate));
      }

      const inverse = rates.find((r) => r.baseCurrency === to && r.targetCurrency === from);
      if (inverse && inverse.rate > 0) {
        return Math.round(amountMinor / inverse.rate);
      }

      // Convert via USD if cross-currency
      const fromToUsd = rates.find((r) => r.targetCurrency === from && r.baseCurrency === 'USD');
      const toToUsd = rates.find((r) => r.targetCurrency === to && r.baseCurrency === 'USD');
      if (fromToUsd && toToUsd && fromToUsd.rate > 0) {
        const usdAmount = amountMinor / fromToUsd.rate;
        return Math.round(usdAmount * toToUsd.rate);
      }

      return amountMinor;
    },
    [currency, rates],
  );

  const formatMoney = useCallback(
    (amountMinor: number, overrideCurrency?: string): string => {
      const curr = overrideCurrency || currency;
      return formatCurrencyAmount(amountMinor, curr, locale);
    },
    [currency, locale],
  );

  const t = useCallback(
    (key: string): string => {
      return DICTIONARY[locale]?.[key] || DICTIONARY['en-US']?.[key] || key;
    },
    [locale],
  );

  return (
    <CurrencyLocaleContext.Provider
      value={{
        currency,
        locale,
        setCurrency,
        setLocale,
        setCountryAndCurrency,
        rates,
        formatMoney,
        convert,
        t,
        isLoading,
      }}
    >
      {children}
    </CurrencyLocaleContext.Provider>
  );
}

export function useCurrency(): CurrencyLocaleContextType {
  const ctx = useContext(CurrencyLocaleContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within a CurrencyLocaleProvider');
  }
  return ctx;
}
