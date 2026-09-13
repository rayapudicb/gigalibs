'use client';

/**
 * TaxCodeSelect — a controlled selector for tax codes / rates.
 *
 * Renders a native <select> over a list of TaxCode objects.  Tax code lists
 * are tenant-configurable and fetched server-side; the component is purely
 * presentational — call `GET /api/ar/tax-codes` and pass the result as the
 * `taxCodes` prop.
 *
 * A "No tax" option is always prepended so users can explicitly set a zero
 * rate.
 */

import { type ChangeEvent } from 'react';

export interface TaxCode {
  code: string;
  label: string;
  /** Rate as a decimal fraction, e.g. 0.20 for 20 %. */
  rate: number;
  type: 'VAT' | 'GST' | 'SALES_TAX' | 'EXCISE' | 'NONE';
}

export interface TaxCodeSelectProps {
  taxCodes: TaxCode[];
  value: string;
  onChange: (code: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  /** Allow an explicit "No tax" choice (defaults to true). */
  allowNone?: boolean;
  className?: string;
}

const SELECT_CLASSES =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 ' +
  'text-sm text-ui-fg-base outline-none transition-all ' +
  'focus:shadow-borders-interactive disabled:cursor-not-allowed disabled:opacity-50';

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(rate % 0.01 === 0 ? 0 : 2)} %`;
}

export function TaxCodeSelect({
  taxCodes,
  value,
  onChange,
  name,
  id,
  disabled,
  required,
  allowNone = true,
  className,
}: TaxCodeSelectProps) {
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
      {allowNone ? (
        <option value="">No tax</option>
      ) : null}
      {taxCodes.map((tc) => (
        <option key={tc.code} value={tc.code}>
          {tc.label} ({formatRate(tc.rate)}) — {tc.type}
        </option>
      ))}
    </select>
  );
}
