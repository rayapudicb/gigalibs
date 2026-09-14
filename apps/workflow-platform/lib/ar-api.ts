export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  correlationId?: string;
  errors?: Array<{ field: string; code: string }>;
}

export class ArApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
  ) {
    const msg = problem.detail ?? problem.title ?? `Request failed (${status})`;
    const cleanMsg = msg.toLowerCase().includes('upstream service is unavailable')
      ? 'Service is temporarily synchronizing. Please try again shortly.'
      : msg;
    super(cleanMsg);
    this.name = 'ArApiError';
  }
}

export interface Customer {
  id: string;
  legalName: string;
  billingEmail: string;
  currency: string;
  externalReference?: string;
  status: 'ACTIVE' | 'ARCHIVED';
  city?: string;
  stateCode?: string;
  countryCode?: string;
  jurisdictionCode?: string;
  dataClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED_PII' | 'FINANCIAL_SOX';
  zipCode?: string;
  taxExemptFAR?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  position: number;
  description: string;
  quantity: string;
  unitAmountMinor: number;
  amountMinor: number;
}

export interface AppliedTax {
  id: string;
  name: string;
  rateBasisPoints: number;
  isCompound: boolean;
  taxableBasisMinor: number;
  amountMinor: number;
}

export interface InstallmentMilestone {
  position: number;
  dueDate: string;
  percentageBasisPoints: number;
  amountMinor: number;
  status?: 'PENDING' | 'PAID';
}

export interface LedgerSeal {
  hash: string;
  previousHash: string;
  sequenceNumber: number;
  sealedAt: string;
  algorithm: 'SHA-256';
}

export interface Invoice {
  id: string;
  billingEntityId: string;
  invoiceSeriesId: string;
  customerId: string;
  customerName?: string;
  invoiceNumber: string | null;
  status: 'DRAFT' | 'ISSUED' | 'VOID';
  currency: string;
  countryCode?: string;
  jurisdictionCode?: string;
  dataClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED_PII' | 'FINANCIAL_SOX';
  issueDate: string;
  dueDate: string;
  purchaseOrderReference?: string | null;
  lines: InvoiceLine[];
  subtotalMinor: number;
  subtotalGrossMinor?: number;
  subtotalNetMinor?: number;
  discountMinor?: number;
  taxMinor: number;
  appliedTaxes?: AppliedTax[];
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  installments?: InstallmentMilestone[];
  seal?: LedgerSeal;
  sealHash?: string | null;
  previousSealHash?: string | null;
  sealSequence?: number | null;
  version: number;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  paymentMethod: 'WIRE' | 'ACH' | 'CHECK' | 'CARD' | 'CREDIT_NOTE' | 'MANUAL';
  paymentReference?: string;
  notes?: string;
  paidAt: string;
  recordedBy: string;
  createdAt: string;
}

export interface VoidRecord {
  id: string;
  invoiceId: string;
  reason: string;
  voidedBy: string;
  voidedAt: string;
}

export interface BillableShift {
  id: string;
  sourceId: string;
  projectId: string;
  projectName: string;
  resourceName: string;
  resourceRole: string;
  quantity: number; // hours
  rawCostCents: number; // base hourly pay in cents
  markupPercent: number; // e.g. 35%
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  billingStatus: 'UNBILLED' | 'INVOICED';
  invoicedInHeaderNumber?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface RateCatalogItem {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: 'Crew / Labor' | 'Equipment / Hardware' | 'Cloud / Infrastructure' | 'Software License';
  unitPriceCents: number;
  unitMetric: string;
  isActive: boolean;
  version?: number;
  createdAt?: string;
}

export interface SetupResponse {
  tenantId: string;
  billingEntityId: string;
  invoiceSeriesId: string;
  legalName: string;
  defaultCurrency: string;
  locale: string;
  timeZone: string;
  invoiceSeriesCode: string;
  invoicePrefix: string;
  invoicePadding: number;
  status: 'ACTIVE';
}

export async function requestAr<T>(path: string, init?: RequestInit): Promise<T> {
  const cleanPath = path.replace(/^\//, '');
  const response = await fetch(`/api/ar/${cleanPath}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as T | ProblemDetails;
  if (!response.ok) {
    throw new ArApiError(response.status, body as ProblemDetails);
  }
  return body as T;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function formatMinorAmount(currency: string, minor: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format((minor || 0) / 100);
  } catch {
    return `${currency || 'USD'} ${((minor || 0) / 100).toFixed(2)}`;
  }
}
