import { describe, expect, it } from 'vitest';
import { evaluateCreditDecision, feedsComplete } from './reconciliation.js';

describe('evaluateCreditDecision', () => {
  const ready = { openArReady: true, uninvoicedOrdersReady: true, prepaymentReady: true };

  it('approves when feeds are complete, no hold, and within limit', () => {
    const result = evaluateCreditDecision({
      feedMarks: ready,
      activeHoldId: null,
      creditLimitMinor: 10_000n,
      ledger: [{ component: 'OPEN_AR', deltaMinor: 2_000n }],
      additionalExposureMinor: 1_000n,
    });
    expect(result).toMatchObject({ decision: 'APPROVED', complete: true, exposureMinor: 2_000n });
  });

  it('refuses when an active hold exists', () => {
    const result = evaluateCreditDecision({
      feedMarks: ready,
      activeHoldId: 'hold-1',
      creditLimitMinor: 10_000n,
      ledger: [],
    });
    expect(result.decision).toBe('ACTIVE_HOLD');
  });

  it('refuses when feeds are incomplete', () => {
    expect(
      feedsComplete({ openArReady: true, uninvoicedOrdersReady: false, prepaymentReady: true }),
    ).toBe(false);
    const result = evaluateCreditDecision({
      feedMarks: { openArReady: true, uninvoicedOrdersReady: false, prepaymentReady: true },
      activeHoldId: null,
      creditLimitMinor: 10_000n,
      ledger: [],
    });
    expect(result.decision).toBe('SOURCE_INCOMPLETE');
  });

  it('refuses over limit including additional exposure', () => {
    const result = evaluateCreditDecision({
      feedMarks: ready,
      activeHoldId: null,
      creditLimitMinor: 5_000n,
      ledger: [{ component: 'OPEN_AR', deltaMinor: 4_000n }],
      additionalExposureMinor: 2_000n,
    });
    expect(result.decision).toBe('OVER_LIMIT');
  });
});
