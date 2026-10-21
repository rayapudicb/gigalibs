import { Translator } from '@gigalibs/i18n';
import { SPEED_EN_US } from './en-US.js';

// WI-OI-120bx: SPEED's texts through the platform translator. A locale without a SPEED dictionary falls back to English.

const translator = new Translator({
  defaultLocale: 'en-US',
  fallbackLocale: 'en-US',
  translations: { 'en-US': { ...SPEED_EN_US } },
});

export type Translate = (
  key: string,
  variables?: Readonly<Record<string, string | number | readonly string[]>>,
) => string;

function flatten(
  variables?: Readonly<Record<string, string | number | readonly string[]>>,
): Record<string, string | number> | undefined {
  if (!variables) return undefined;
  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : (value as string | number),
    ]),
  );
}

/** The text for `key` in `locale` (the page's language), with `{name}` parameters filled in. */
export function speedText(locale = 'en-US'): Translate {
  return (key, variables) => translator.t(key, flatten(variables), locale);
}

/** Whether the catalogue has a text for `code`, so a server message is shown only for codes it does not know. */
export function knowsCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPEED_EN_US, code);
}
