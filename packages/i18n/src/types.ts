export type LocaleDictionary = Record<string, any>;

export interface SupportedLocale {
  code: string;
  name: string;
  englishName: string;
  direction: 'ltr' | 'rtl';
}

export interface I18nConfig {
  defaultLocale: string;
  fallbackLocale: string;
  translations: Record<string, LocaleDictionary>;
}
