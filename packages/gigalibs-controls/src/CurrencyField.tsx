'use client';

/**
 * CurrencyField — a controlled <select> for ISO 4217 currency codes.
 *
 * The field renders a native <select> styled with Medusa UI design tokens.
 * It ships a sensible default currency list but accepts a `currencies` prop
 * to restrict or extend choices.  An arbitrary `value` is always preserved
 * as an option so an invoice locked to an unusual currency never loses its
 * current selection.
 */

import { type ChangeEvent } from 'react';

export const COMMON_CURRENCIES: readonly string[] = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'DKK', 'EUR', 'GBP', 'HKD',
  'INR', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD', 'USD',
  'ZAR',
] as const;

export interface CurrencyFieldProps {
  /** Current ISO 4217 code, e.g. "USD". */
  value: string;
  onChange: (code: string) => void;
  /** html `name` attribute forwarded to the underlying <select>. */
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  /** Override the default currency list. Must include `value` if you want the
   *  current selection visible; the component adds it automatically if missing. */
  currencies?: readonly string[];
  className?: string;
}

const SELECT_CLASSES =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 ' +
  'text-sm text-ui-fg-base outline-none transition-all ' +
  'focus:shadow-borders-interactive disabled:cursor-not-allowed disabled:opacity-50';

export function CurrencyField({
  value,
  onChange,
  name,
  id,
  disabled,
  required,
  currencies = COMMON_CURRENCIES,
  className,
}: CurrencyFieldProps) {
  const list = currencies.includes(value)
    ? currencies
    : [value, ...currencies];

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    onChange(event.target.value);
  }

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      required={required}
      className={[SELECT_CLASSES, className].filter(Boolean).join(' ')}
    >
      {list.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}
