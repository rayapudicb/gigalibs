import { calculateCreditExposure, type CreditComponent } from './exposure.js';

export type CreditDecision =
  | 'APPROVED'
  | 'ACTIVE_HOLD'
  | 'SOURCE_INCOMPLETE'
  | 'OVER_LIMIT'
  | 'RECONCILE_REQUIRED';

export interface CreditFeedMarks {
  readonly openArReady: boolean;
  readonly uninvoicedOrdersReady: boolean;
  readonly prepaymentReady: boolean;
}

export function feedsComplete(marks: CreditFeedMarks): boolean {
  return marks.openArReady && marks.uninvoicedOrdersReady && marks.prepaymentReady;
}

export function evaluateCreditDecision(input: {
  readonly feedMarks: CreditFeedMarks;
  readonly activeHoldId: string | null;
  readonly ledger: ReadonlyArray<{ component: CreditComponent; deltaMinor: bigint }>;
  readonly creditLimitMinor: bigint;
  readonly additionalExposureMinor?: bigint;
}): {
  decision: CreditDecision;
  complete: boolean;
  exposureMinor: bigint;
  availableMinor: bigint;
} {
  const additional = input.additionalExposureMinor ?? 0n;
  let exposure;
  try {
    exposure = calculateCreditExposure(input.ledger, input.creditLimitMinor);
  } catch {
    return {
      decision: 'RECONCILE_REQUIRED',
      complete: false,
      exposureMinor: 0n,
      availableMinor: 0n,
    };
  }
  const projectedExposure = exposure.exposureMinor + additional;
  const projectedAvailable = input.creditLimitMinor - projectedExposure;

  if (input.activeHoldId) {
    return {
      decision: 'ACTIVE_HOLD',
      complete: false,
      exposureMinor: exposure.exposureMinor,
      availableMinor: exposure.availableMinor,
    };
  }
  if (!feedsComplete(input.feedMarks)) {
    return {
      decision: 'SOURCE_INCOMPLETE',
      complete: false,
      exposureMinor: exposure.exposureMinor,
      availableMinor: exposure.availableMinor,
    };
  }
  if (projectedExposure > input.creditLimitMinor) {
    return {
      decision: 'OVER_LIMIT',
      complete: true,
      exposureMinor: exposure.exposureMinor,
      availableMinor: exposure.availableMinor,
    };
  }
  return {
    decision: 'APPROVED',
    complete: true,
    exposureMinor: exposure.exposureMinor,
    availableMinor: projectedAvailable,
  };
}
