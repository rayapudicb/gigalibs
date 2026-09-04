import type { I18nConfig, LocaleDictionary } from './types.js';

export class Translator {
  private config: I18nConfig;
  private currentLocale: string;

  constructor(config?: Partial<I18nConfig>) {
    this.config = {
      defaultLocale: config?.defaultLocale ?? 'en',
      fallbackLocale: config?.fallbackLocale ?? 'en',
      translations: config?.translations ?? {},
    };
    this.currentLocale = this.config.defaultLocale;
  }

  setLocale(locale: string): void {
    this.currentLocale = locale;
  }

  getLocale(): string {
    return this.currentLocale;
  }

  addTranslations(locale: string, dictionary: LocaleDictionary): void {
    this.config.translations[locale] = {
      ...(this.config.translations[locale] ?? {}),
      ...dictionary,
    };
  }

  t(key: string, variables?: Record<string, string | number>, locale = this.currentLocale): string {
    const dict = this.config.translations[locale] || this.config.translations[this.config.fallbackLocale] || {};
    let text = (dict[key] as string) || key;

    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        text = text.replaceAll(`{{${k}}}`, String(v));
      }
    }

    return text;
  }
}

export const i18n = new Translator();
