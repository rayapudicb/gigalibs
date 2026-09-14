import { enUS } from './en-US.js';
import { esES } from './es-ES.js';
import { frFR } from './fr-FR.js';
import { deDE } from './de-DE.js';
import { jaJP } from './ja-JP.js';
import { arSA } from './ar-SA.js';
import type { LocaleDictionary, SupportedLocale } from '../types.js';

export { enUS, esES, frFR, deDE, jaJP, arSA };

export const DEFAULT_LOCALE: SupportedLocale = {
  code: 'en-US',
  name: 'English (US)',
  englishName: 'English (US)',
  direction: 'ltr',
};

export const SUPPORTED_LOCALES: SupportedLocale[] = [
  DEFAULT_LOCALE,
  { code: 'es-ES', name: 'Español', englishName: 'Spanish', direction: 'ltr' },
  { code: 'fr-FR', name: 'Français', englishName: 'French', direction: 'ltr' },
  { code: 'de-DE', name: 'Deutsch', englishName: 'German', direction: 'ltr' },
  { code: 'ja-JP', name: '日本語', englishName: 'Japanese', direction: 'ltr' },
  { code: 'ar-SA', name: 'العربية', englishName: 'Arabic', direction: 'rtl' },
];

export const BUILTIN_DICTIONARIES: Record<string, LocaleDictionary> = {
  'en-US': enUS,
  'es-ES': esES,
  'fr-FR': frFR,
  'de-DE': deDE,
  'ja-JP': jaJP,
  'ar-SA': arSA,
  // Short code aliases
  en: enUS,
  es: esES,
  fr: frFR,
  de: deDE,
  ja: jaJP,
  ar: arSA,
};

export function isRtlLocale(locale: string): boolean {
  const normalized = locale.toLowerCase().split('-')[0] || '';
  return ['ar', 'he', 'fa', 'ur'].includes(normalized);
}

export function resolveSupportedLocale(locale?: string | null): SupportedLocale {
  if (!locale) return DEFAULT_LOCALE;
  const target = locale.toLowerCase();
  const targetPrefix = target.split('-')[0] || '';
  const found = SUPPORTED_LOCALES.find(
    (l) => l.code.toLowerCase() === target || (l.code.split('-')[0] || '').toLowerCase() === targetPrefix
  );
  return found ?? DEFAULT_LOCALE;
}
