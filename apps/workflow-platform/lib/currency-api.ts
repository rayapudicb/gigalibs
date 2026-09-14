export interface CurrencyPair {
  id: string;
  tenantId: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  inverseRate: number;
  rateMicros: string;
  inverseRateMicros: string;
  rateSource: string;
  spreadBasisPoints: number;
  status: string;
  effectiveAt: string;
}

export interface ConvertRequest {
  sourceModule: string;
  documentId?: string;
  documentReference?: string;
  fromCurrency: string;
  toCurrency: string;
  amountMinor: number;
  idempotencyKey?: string;
}

export interface ConvertResult {
  id: string;
  sourceModule: string;
  documentId: string;
  documentReference: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmountMinor: number;
  convertedAmountMinor: number;
  appliedRate: number;
  appliedRateMicros: number;
  rateSource: string;
  feeMinor: number;
  settlementDate: string;
  idempotencyKey: string;
  idempotencyReplayed: boolean;
}

export interface TenantPreferences {
  tenantId: string;
  functionalCurrency: string;
  presentationCurrency: string;
  defaultLocale: string;
  autoConvertForeignInvoices: boolean;
}

export interface HedgingContract {
  id: string;
  contractNumber: string;
  counterpartyBank: string;
  pairId: string;
  notionalAmountMinor: number;
  strikeRate: number;
  maturityDate: string;
  hedgeType: string;
  unrealizedGainLossMinor: number;
  status: string;
}

export async function requestCurrency<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `/api/currency/${path.replace(/^\//, '')}`;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = `Currency API error (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorDetail = errJson.detail;
      else if (errJson.message) errorDetail = errJson.message;
    } catch {
      // fallback to status
    }
    const cleanDetail = errorDetail.toLowerCase().includes('upstream service is unavailable')
      ? 'Service is temporarily synchronizing. Please try again shortly.'
      : errorDetail;
    throw new Error(cleanDetail);
  }

  const json = await res.json();
  return json.data !== undefined ? json.data : json;
}

export function formatCurrencyAmount(
  amountMinor: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}
