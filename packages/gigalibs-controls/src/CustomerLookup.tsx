'use client';

/**
 * CustomerLookup — a search-filtered customer selector.
 *
 * Renders a text search input that filters the supplied customer list, and a
 * native <select> below it that always holds the selected customerId.  The two
 * are kept in sync so the parent can use the value in a form submission.
 *
 * The component is fully controlled: the caller owns the list (via `customers`)
 * and the selected value (via `value`/`onChange`).
 */

import { type ChangeEvent, useMemo, useState, useId } from 'react';

export interface CustomerOption {
  id: string;
  legalName: string;
  billingEmail: string;
  currency: string;
  externalReference?: string;
}

export interface CustomerLookupProps {
  customers: CustomerOption[];
  value: string;
  onChange: (customerId: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Max visible rows in the list-box (defaults to 5). */
  listSize?: number;
  className?: string;
}

const INPUT_CLASSES =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-1.5 ' +
  'text-sm text-ui-fg-base outline-none transition-all ' +
  'placeholder:text-ui-fg-muted focus:shadow-borders-interactive ' +
  'disabled:cursor-not-allowed disabled:opacity-50 mb-1.5';

const SELECT_CLASSES =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 ' +
  'text-sm text-ui-fg-base outline-none transition-all ' +
  'focus:shadow-borders-interactive disabled:cursor-not-allowed disabled:opacity-50';

export function CustomerLookup({
  customers,
  value,
  onChange,
  name,
  id,
  disabled,
  required,
  placeholder = 'Search customers…',
  listSize = 5,
  className,
}: CustomerLookupProps) {
  const [search, setSearch] = useState('');
  const searchId = useId();

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.legalName.toLowerCase().includes(q) ||
        c.billingEmail.toLowerCase().includes(q) ||
        (c.externalReference ?? '').toLowerCase().includes(q),
    );
  }, [customers, search]);

  // Ensure current selection stays visible even if it's filtered out
  const options = useMemo(() => {
    if (!value) return filtered;
    const inList = filtered.some((c) => c.id === value);
    if (inList) return filtered;
    const selected = customers.find((c) => c.id === value);
    return selected ? [selected, ...filtered] : filtered;
  }, [filtered, customers, value]);

  function handleSearch(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);
  }

  function handleSelect(event: ChangeEvent<HTMLSelectElement>) {
    onChange(event.target.value);
  }

  return (
    <div className={className}>
      <input
        id={searchId}
        type="search"
        value={search}
        onChange={handleSearch}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Filter customer list"
        className={INPUT_CLASSES}
        autoComplete="off"
      />
      <select
        id={id}
        name={name}
        value={value}
        onChange={handleSelect}
        disabled={disabled}
        required={required}
        size={Math.min(options.length + 1, listSize)}
        className={SELECT_CLASSES}
      >
        <option value="" disabled>
          Select a customer
        </option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.legalName} · {c.currency}
            {c.billingEmail ? ` · ${c.billingEmail}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
