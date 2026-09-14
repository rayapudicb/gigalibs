export interface TaxJurisdiction {
  id: string;
  tenantId: string;
  countryCode: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  taxType: string;
  standardRateBasisPoints: number;
  reducedRateBasisPoints: number;
  hasPhysicalNexus: boolean;
  hasEconomicNexus: boolean;
  economicThresholdRevenueMinor: number;
  economicThresholdTransactions: number;
  currentPeriodRevenueMinor: number;
  currentPeriodTransactions: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxRate {
  id: string;
  tenantId: string;
  jurisdictionId: string;
  jurisdictionCode?: string;
  jurisdictionName?: string;
  productCategory: string;
  rateBasisPoints: number;
  isExempt: boolean;
  effectiveFrom: string;
  effectiveUntil?: string;
  createdAt: string;
}

export interface ExemptionCertificate {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  certificateNumber: string;
  jurisdictionCode: string;
  exemptionReason: string;
  documentUrl?: string;
  validFrom: string;
  validUntil: string;
  isVerified: boolean;
  status: string;
  createdAt: string;
}

export interface TaxLedgerEntry {
  id: string;
  tenantId: string;
  sourceModule: string;
  documentId: string;
  documentReference?: string;
  jurisdictionCode: string;
  productCategory: string;
  taxableAmountMinor: number;
  exemptAmountMinor: number;
  calculatedTaxMinor: number;
  appliedRateBasisPoints: number;
  exemptionCertificateId?: string;
  idempotencyKey: string;
  isExempt: boolean;
  createdAt: string;
}

export interface NexusMonitorSummary {
  jurisdictionCode: string;
  jurisdictionName: string;
  countryCode: string;
  currentRevenueMinor: number;
  thresholdRevenueMinor: number;
  revenuePercent: number;
  currentTransactions: number;
  thresholdTransactions: number;
  transactionPercent: number;
  hasNexus: boolean;
  status: 'SAFE' | 'WARNING_75_PERCENT' | 'NEXUS_ESTABLISHED';
}

export function formatRateBasisPoints(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatMinorToCurrency(minor: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

export async function requestTax<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/tax/${path.replace(/^\//, '')}`;
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Tax API Error ${res.status}: ${errorBody || res.statusText}`);
  }

  const json = await res.json();
  return json.data ?? json;
}
