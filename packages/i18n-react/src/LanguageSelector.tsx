import React from 'react';
import { useLocale } from './context.js';

export interface LanguageSelectorProps {
  className?: string;
  id?: string;
  disabled?: boolean;
  value?: string;
  onChange?: (newLocale: string) => void;
  showDirectionBadge?: boolean;
}

export function LanguageSelector({
  className = '',
  id = 'gigalibs-language-selector',
  disabled = false,
  value,
  onChange,
  showDirectionBadge = false,
}: LanguageSelectorProps): React.JSX.Element {
  const { locale, setLocale, supportedLocales } = useLocale();
  const currentVal = value !== undefined ? value : locale;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (onChange) {
      onChange(selected);
    } else {
      setLocale(selected);
    }
  };

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      <select
        id={id}
        value={currentVal}
        onChange={handleChange}
        disabled={disabled}
        aria-label="Language selection"
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {supportedLocales.map((loc) => (
          <option key={loc.code} value={loc.code}>
            {loc.name} {loc.englishName !== loc.name ? `(${loc.englishName})` : ''}
            {showDirectionBadge && loc.direction === 'rtl' ? ' [RTL]' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
