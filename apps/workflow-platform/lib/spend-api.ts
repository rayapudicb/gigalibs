export interface CostCenter {
  id: string;
  code: string;
  name: string;
  managerName: string;
  managerEmail: string;
  currency: string;
  allocatedBudgetMinor: number;
  committedBudgetMinor: number;
  spentBudgetMinor: number;
  fiscalYear: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseLine {
  id: string;
  lineNumber: number;
  description: string;
  glCode: string;
  amountMinor: number;
  taxMinor: number;
}

export interface Expense {
  id: string;
  costCenterId: string;
  costCenterCode?: string;
  costCenterName?: string;
  employeeName: string;
  employeeEmail: string;
  merchant: string;
  category: string;
  paymentMethod: string;
  currency: string;
  amountMinor: number;
  taxMinor: number;
  receiptUrl?: string;
  receiptFilename?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REIMBURSED' | 'REJECTED';
  policyViolationFlag: boolean;
  policyViolationNotes?: string;
  approverName?: string;
  approvedAt?: string;
  reimbursedAt?: string;
  version: number;
  lines: ExpenseLine[];
  createdAt: string;
  updatedAt: string;
}

export interface TravelRequest {
  id: string;
  costCenterId: string;
  costCenterCode?: string;
  costCenterName?: string;
  employeeName: string;
  employeeEmail: string;
  destinationCity: string;
  destinationCountry: string;
  departureDate: string;
  returnDate: string;
  gsaCityTier: string;
  perDiemDailyRateMinor: number;
  lodgingCeilingDailyMinor: number;
  estimatedTotalMinor: number;
  actualSpendMinor: number;
  status: string;
  businessPurpose: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImprestWallet {
  id: string;
  walletName: string;
  custodianName: string;
  custodianEmail: string;
  currency: string;
  targetBalanceMinor: number;
  currentBalanceMinor: number;
  lowBalanceThresholdMinor: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImprestTransaction {
  id: string;
  walletId: string;
  voucherNumber: string;
  transactionType: string;
  recipientName: string;
  amountMinor: number;
  balanceAfterMinor: number;
  purpose: string;
  receiptAttached: boolean;
  recordedBy: string;
  createdAt: string;
}

export interface SaasSubscription {
  id: string;
  vendorName: string;
  category: string;
  costCenterId: string;
  costCenterCode?: string;
  costCenterName?: string;
  ownerEmail: string;
  billingFrequency: string;
  seatsAllocated: number;
  seatsUtilized: number;
  costPerSeatMinor: number;
  annualRunRateMinor: number;
  renewalDate: string;
  status: string;
  autoRenew: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SpendMetrics {
  totalAllocatedMinor: number;
  totalCommittedMinor: number;
  totalSpentMinor: number;
  costCentersCount: number;
  pendingApprovalsCount: number;
  approvedTotalMinor: number;
  reimbursedTotalMinor: number;
  activeSubscriptionsCount: number;
  saasAnnualRunRateMinor: number;
  walletsCount: number;
  totalPettyCashMinor: number;
  categoryBreakdown: { category: string; count: number; totalMinor: number }[];
}

export function formatMinorAmount(minor: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function requestSpend<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `/api/spend${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const body = await response.json();
      errorDetail = body.detail || body.message || JSON.stringify(body);
    } catch {
      // Keep statusText
    }
    const cleanDetail = errorDetail.toLowerCase().includes('upstream service is unavailable')
      ? 'Service is temporarily synchronizing. Please try again shortly.'
      : errorDetail;
    throw new Error(`Spend API error (${response.status}): ${cleanDetail}`);
  }

  return (await response.json()) as T;
}
