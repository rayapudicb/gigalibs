import { createHash } from 'node:crypto';
import type {
  BudgetControlAction,
  BudgetCheckResultV1,
  PeriodDistributionMethod,
} from '@gigalibs/contracts';

/**
 * Deterministic periodic distribution of annual budget with 100% cent conservation.
 * Integer math only: zero floating-point math.
 */
export function distributeAnnualBudget(
  annualMinorStr: string,
  periodCount: number,
  _method: PeriodDistributionMethod = 'EQUAL_MONTHLY',
): string[] {
  if (periodCount <= 0) {
    throw new Error('Period count must be at least 1');
  }
  const annual = BigInt(annualMinorStr);
  if (annual < 0n) {
    throw new Error('Annual budget cannot be negative');
  }

  const count = BigInt(periodCount);
  const base = annual / count;
  const remainder = annual - base * count;

  const distributions: string[] = [];
  for (let i = 0; i < periodCount; i++) {
    // Exact cent conservation: remainder is added to the first period
    const amount = i === 0 ? base + remainder : base;
    distributions.push(amount.toString());
  }

  return distributions;
}

export interface EvaluateSpendAvailabilityParams {
  budgetLineId?: string | null;
  allocatedMinorStr: string;
  actualMinorStr: string;
  encumberedMinorStr: string;
  requestedMinorStr: string;
  controlAction: BudgetControlAction;
  toleranceThresholdPct?: number; // e.g. 5.0 for 5% overspend allowed
}

/**
 * Fail-closed Spend Availability Evaluation:
 * Available = Allocated - (Actual + Encumbered)
 * Resulting = Available - Requested
 */
export function evaluateSpendAvailability(
  params: EvaluateSpendAvailabilityParams,
): BudgetCheckResultV1 {
  const allocated = BigInt(params.allocatedMinorStr);
  const actual = BigInt(params.actualMinorStr);
  const encumbered = BigInt(params.encumberedMinorStr);
  const requested = BigInt(params.requestedMinorStr);
  const tolerancePct = params.toleranceThresholdPct ?? 0;

  const consumed = actual + encumbered;
  const available = allocated - consumed;
  const resultingAvailable = available - requested;

  // Calculate buffer with tolerance
  const toleranceBps = BigInt(Math.round(tolerancePct * 100));
  const toleranceBufferMinor = (allocated * toleranceBps) / 10000n;
  const maxAllowedSpend = allocated + toleranceBufferMinor;
  const totalSpendWithRequest = consumed + requested;
  const isWithinBudgetOrTolerance = totalSpendWithRequest <= maxAllowedSpend;

  let isAllowed = true;
  let message = 'Spend request is within budget limits.';

  if (params.controlAction === 'DISABLED') {
    isAllowed = true;
    message = 'Budget controls are disabled for this structure.';
  } else if (isWithinBudgetOrTolerance) {
    if (resultingAvailable < 0n && tolerancePct > 0) {
      message = `Spend request exceeds baseline budget but is permitted within ${tolerancePct}% tolerance threshold.`;
    } else {
      message = 'Spend request is within budget limits.';
    }
    isAllowed = true;
  } else {
    const overspendMinor = totalSpendWithRequest - maxAllowedSpend;
    switch (params.controlAction) {
      case 'HARD_STOP':
        isAllowed = false;
        message = `Spend request of ${params.requestedMinorStr} cents rejected. Exceeds budget limit by ${overspendMinor} cents.`;
        break;
      case 'ADVISORY_WARN':
        isAllowed = true;
        message = `Warning: Spend request exceeds budget limit by ${overspendMinor} cents.`;
        break;
      case 'AUDIT_LOG':
        isAllowed = true;
        message = `Audit Notice: Spend request exceeds budget limit by ${overspendMinor} cents. Logged for review.`;
        break;
    }
  }

  return {
    isAllowed,
    budgetLineId: params.budgetLineId ?? null,
    allocatedAmountMinor: allocated.toString(),
    actualAmountMinor: actual.toString(),
    encumberedAmountMinor: encumbered.toString(),
    availableAmountMinor: available.toString(),
    requestedAmountMinor: requested.toString(),
    resultingAvailableMinor: resultingAvailable.toString(),
    controlAction: params.controlAction,
    toleranceThresholdPct: tolerancePct,
    message,
  };
}

export interface LineVarianceResult {
  budgetLineId: string;
  accountId: string;
  costCenterId: string;
  fiscalPeriodId: string;
  allocatedMinor: string;
  encumberedMinor: string;
  actualMinor: string;
  availableMinor: string;
  varianceMinor: string;
  burnRatePct: number;
  isOverBudget: boolean;
}

/**
 * Calculates budget line variance, uncommitted headroom, and burn rate percentage.
 */
export function calculateVariance(
  budgetLineId: string,
  accountId: string,
  costCenterId: string,
  fiscalPeriodId: string,
  allocatedMinorStr: string,
  encumberedMinorStr: string,
  actualMinorStr: string,
): LineVarianceResult {
  const allocated = BigInt(allocatedMinorStr);
  const encumbered = BigInt(encumberedMinorStr);
  const actual = BigInt(actualMinorStr);

  const consumed = actual + encumbered;
  const available = allocated - consumed;
  const variance = allocated - consumed;

  let burnRatePct = 0;
  if (allocated > 0n) {
    burnRatePct = Number((consumed * 10000n) / allocated) / 100;
  } else if (consumed > 0n) {
    burnRatePct = 100;
  }

  return {
    budgetLineId,
    accountId,
    costCenterId,
    fiscalPeriodId,
    allocatedMinor: allocated.toString(),
    encumberedMinor: encumbered.toString(),
    actualMinor: actual.toString(),
    availableMinor: available.toString(),
    varianceMinor: variance.toString(),
    burnRatePct,
    isOverBudget: consumed > allocated,
  };
}

export interface ChecksumLineItem {
  fiscalPeriodId: string;
  accountId: string;
  costCenterId: string;
  allocatedAmountMinor: string;
}

/**
 * Deterministic SHA-256 checksum generation for budget revision seal.
 */
export function computeRevisionChecksum(
  revisionNumber: number,
  fiscalYearId: string,
  lines: ChecksumLineItem[],
): string {
  const sorted = [...lines].sort((a, b) => {
    const pComp = a.fiscalPeriodId.localeCompare(b.fiscalPeriodId);
    if (pComp !== 0) return pComp;
    const aComp = a.accountId.localeCompare(b.accountId);
    if (aComp !== 0) return aComp;
    return a.costCenterId.localeCompare(b.costCenterId);
  });

  const payload = JSON.stringify({
    revisionNumber,
    fiscalYearId,
    lines: sorted,
  });

  return createHash('sha256').update(payload).digest('hex');
}
