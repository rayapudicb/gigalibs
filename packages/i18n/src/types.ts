export type LocaleDictionary = Record<string, string | Record<string, unknown>>;

export interface I18nConfig {
  defaultLocale: string;
  fallbackLocale: string;
  translations: Record<string, LocaleDictionary>;
}
