import type { I18nConfig, LocaleDictionary } from './types.js';
import { BUILTIN_DICTIONARIES, isRtlLocale, resolveSupportedLocale } from './locales/index.js';

function getNestedValue(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

export class Translator {
  private config: I18nConfig;
  private currentLocale: string;

  constructor(config?: Partial<I18nConfig>) {
    this.config = {
      defaultLocale: config?.defaultLocale ?? 'en-US',
      fallbackLocale: config?.fallbackLocale ?? 'en-US',
      translations: {
        ...BUILTIN_DICTIONARIES,
        ...(config?.translations ?? {}),
      },
    };
    this.currentLocale = this.config.defaultLocale;
  }

  setLocale(locale: string): void {
    this.currentLocale = resolveSupportedLocale(locale).code;
  }

  getLocale(): string {
    return this.currentLocale;
  }

  getDirection(locale = this.currentLocale): 'ltr' | 'rtl' {
    return isRtlLocale(locale) ? 'rtl' : 'ltr';
  }

  addTranslations(locale: string, dictionary: LocaleDictionary): void {
    this.config.translations[locale] = {
      ...(this.config.translations[locale] ?? {}),
      ...dictionary,
    };
  }

  t(key: string, variables?: Record<string, string | number>, locale = this.currentLocale): string {
    const dict = this.config.translations[locale] || this.config.translations[this.config.fallbackLocale] || {};
    
    let text = typeof dict[key] === 'string' ? dict[key] : getNestedValue(dict, key);
    
    if (!text && locale !== this.config.fallbackLocale) {
      const fallbackDict = this.config.translations[this.config.fallbackLocale] || {};
      text = typeof fallbackDict[key] === 'string' ? fallbackDict[key] : getNestedValue(fallbackDict, key);
    }

    if (!text) {
      const segments = key.split('.');
      return segments[segments.length - 1] || key;
    }

    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        text = text.replaceAll(`{{${k}}}`, String(v)).replaceAll(`{${k}}`, String(v));
      }
    }

    return text;
  }
}

export const i18n = new Translator();
