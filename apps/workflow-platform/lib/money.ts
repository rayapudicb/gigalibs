/**
 * Formats an integer amount expressed in the ISO currency's minor unit without
 * converting it through JavaScript Number (which would lose precision for
 * large ledger values).
 */
export function formatMinorAmount(value: string, currency: string): string {
  const normalizedCurrency = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new Error(`Invalid ISO 4217 currency code '${currency}'.`);
  }
  if (!/^-?\d+$/.test(value)) {
    throw new Error('Minor-unit monetary values must be integer strings.');
  }

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: normalizedCurrency,
    currencyDisplay: 'code',
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10n ** BigInt(fractionDigits);
  const amount = BigInt(value);
  const absoluteAmount = amount < 0n ? -amount : amount;
  const whole = absoluteAmount / scale;
  const remainder = absoluteAmount % scale;
  const groupedWhole = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(whole);
  const decimalSeparator =
    new Intl.NumberFormat(undefined, { minimumFractionDigits: 1 })
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.';
  const fraction =
    fractionDigits === 0
      ? ''
      : `${decimalSeparator}${remainder.toString().padStart(fractionDigits, '0')}`;

  return `${normalizedCurrency} ${amount < 0n ? '-' : ''}${groupedWhole}${fraction}`;
}
