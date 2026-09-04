export function formatCurrency(
  amountInSubunits: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  const majorUnits = amountInSubunits / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(majorUnits);
}
