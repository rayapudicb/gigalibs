'use client';

import React from 'react';
import {
  COUNTRY_DATA,
  SupportedCurrency,
  SupportedLocale,
  useCurrency,
} from './CurrencyLocaleContext';
import { Globe, DollarSign, Link2 } from 'lucide-react';

const CURRENCY_OPTIONS: { code: SupportedCurrency; country: string; flag: string; symbol: string }[] = [
  { code: 'INR', country: 'India', flag: '🇮🇳', symbol: '₹' },
  { code: 'JPY', country: 'Japan', flag: '🇯🇵', symbol: '¥' },
  { code: 'USD', country: 'United States', flag: '🇺🇸', symbol: '$' },
  { code: 'EUR', country: 'Eurozone', flag: '🇪🇺', symbol: '€' },
  { code: 'GBP', country: 'United Kingdom', flag: '🇬🇧', symbol: '£' },
  { code: 'CAD', country: 'Canada', flag: '🇨🇦', symbol: 'CA$' },
  { code: 'AUD', country: 'Australia', flag: '🇦🇺', symbol: 'A$' },
  { code: 'CHF', country: 'Switzerland', flag: '🇨🇭', symbol: 'CHF' },
  { code: 'SGD', country: 'Singapore', flag: '🇸🇬', symbol: 'S$' },
];

const LOCALE_OPTIONS: { code: SupportedLocale; country: string; flag: string; label: string }[] = [
  { code: 'en-IN', country: 'India', flag: '🇮🇳', label: 'English (IN)' },
  { code: 'ja-JP', country: 'Japan', flag: '🇯🇵', label: '日本語 (JP)' },
  { code: 'en-US', country: 'United States', flag: '🇺🇸', label: 'English (US)' },
  { code: 'de-DE', country: 'Germany', flag: '🇩🇪', label: 'Deutsch (DE)' },
  { code: 'fr-FR', country: 'France', flag: '🇫🇷', label: 'Français (FR)' },
  { code: 'en-GB', country: 'United Kingdom', flag: '🇬🇧', label: 'English (UK)' },
  { code: 'en-CA', country: 'Canada', flag: '🇨🇦', label: 'English (CA)' },
  { code: 'en-AU', country: 'Australia', flag: '🇦🇺', label: 'English (AU)' },
  { code: 'de-CH', country: 'Switzerland', flag: '🇨🇭', label: 'Deutsch (CH)' },
  { code: 'en-SG', country: 'Singapore', flag: '🇸🇬', label: 'English (SG)' },
];

export function CurrencyLocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const { currency, setCurrency, locale, setLocale } = useCurrency();

  const activeCountry = COUNTRY_DATA[currency] || COUNTRY_DATA.USD;

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${
        compact ? 'text-[11px]' : 'text-xs'
      }`}
      title={`Country & Currency Synchronized: ${activeCountry.countryName} (${activeCountry.currency} - ${activeCountry.locale})`}
    >
      {/* Currency Selector (Synchronized with Country) */}
      <div className="flex items-center gap-1.5 bg-ui-bg-subtle border border-ui-border-base rounded-md px-2 py-1 shadow-2xs hover:border-ui-border-interactive transition">
        <span className="text-sm select-none" aria-hidden="true">
          {activeCountry.flag}
        </span>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
          className="bg-transparent text-ui-fg-base font-semibold focus:outline-none cursor-pointer pr-1"
          aria-label="Select Currency and Country"
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code} className="bg-ui-bg-base text-ui-fg-base">
              {c.code} ({c.symbol})
            </option>
          ))}
        </select>
      </div>

      {/* Linked Synchronicity Indicator */}
      <span className="text-ui-fg-muted/60" title="Country and Currency are coupled in parallel">
        <Link2 className="w-3 h-3 rotate-45" />
      </span>

      {/* Country Locale / Language Selector (Synchronized with Currency) */}
      <div className="flex items-center gap-1.5 bg-ui-bg-subtle border border-ui-border-base rounded-md px-2 py-1 shadow-2xs hover:border-ui-border-interactive transition">
        <Globe className="w-3.5 h-3.5 text-ui-fg-muted shrink-0" />
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as SupportedLocale)}
          className="bg-transparent text-ui-fg-base font-medium focus:outline-none cursor-pointer pr-1"
          aria-label="Select Country Locale"
        >
          {LOCALE_OPTIONS.map((l) => (
            <option key={l.code} value={l.code} className="bg-ui-bg-base text-ui-fg-base">
              {l.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
