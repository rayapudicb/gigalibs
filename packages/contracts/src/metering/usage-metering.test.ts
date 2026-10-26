import { describe, expect, it } from 'vitest';
import {
  RecordUsageSchema,
  billingPeriodKey,
  buildUsageStatement,
  isBillingPeriodKey,
  meterUsageDetail,
  usageThresholdBand,
} from './usage-metering.js';

// WI-OI-015 (T8b): the pure metering + billing-hand-off logic. The plan figures are placeholders; the MATH (free
// allowance, overage, rounding up, statement totals) is the contract and is what these lock down.
describe('billing period key', () => {
  it('buckets a moment into its UTC YYYY-MM', () => {
    expect(billingPeriodKey(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03');
    expect(billingPeriodKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(billingPeriodKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });

  it('validates a period key', () => {
    expect(isBillingPeriodKey('2026-03')).toBe(true);
    expect(isBillingPeriodKey('2026-13')).toBe(false);
    expect(isBillingPeriodKey('2026-00')).toBe(false);
    expect(isBillingPeriodKey('26-3')).toBe(false);
    expect(isBillingPeriodKey('2026-03-01')).toBe(false);
  });
});

describe('usageThresholdBand', () => {
  it('reports the highest band crossed, or null under 80% / when unlimited', () => {
    expect(usageThresholdBand(70, 100)).toBeNull();
    expect(usageThresholdBand(80, 100)).toBe(80);
    expect(usageThresholdBand(95, 100)).toBe(90);
    expect(usageThresholdBand(100, 100)).toBe(100);
    expect(usageThresholdBand(250, 100)).toBe(100);
    expect(usageThresholdBand(1_000_000, null)).toBeNull();
  });
});

describe('meterUsageDetail', () => {
  it('bills nothing within the allowance and rounds overage up', () => {
    expect(
      meterUsageDetail('API_REQUESTS', 70_000, {
        includedQuantity: 100_000,
        overageRateMinorPerUnit: 0.01,
      }),
    ).toMatchObject({ overage: 0, amountMinor: 0, thresholdBand: null });
    // Exactly 80% is within the allowance (no overage) but does cross the 80% alert band.
    expect(
      meterUsageDetail('API_REQUESTS', 80_000, {
        includedQuantity: 100_000,
        overageRateMinorPerUnit: 0.01,
      }),
    ).toMatchObject({ overage: 0, amountMinor: 0, thresholdBand: 80 });
    // 50,000 over at 0.01 minor each = 500 minor exactly.
    expect(
      meterUsageDetail('API_REQUESTS', 150_000, {
        includedQuantity: 100_000,
        overageRateMinorPerUnit: 0.01,
      }),
    ).toMatchObject({ overage: 50_000, amountMinor: 500, thresholdBand: 100 });
    // Fractional product rounds UP: 1 unit over at 0.0002 = 0.0002 -> 1 minor.
    expect(
      meterUsageDetail('AI_TOKENS', 1_000_001, {
        includedQuantity: 1_000_000,
        overageRateMinorPerUnit: 0.0002,
      }).amountMinor,
    ).toBe(1);
  });

  it('never bills on an unlimited meter', () => {
    expect(
      meterUsageDetail('API_REQUESTS', 9_999_999, {
        includedQuantity: null,
        overageRateMinorPerUnit: 5,
      }),
    ).toMatchObject({ overage: 0, amountMinor: 0 });
  });
});

describe('buildUsageStatement (the billing hand-off)', () => {
  it('reports every meter but only emits line-items for billable overage, and totals them', () => {
    const statement = buildUsageStatement(
      { API_REQUESTS: 150_000, WORKFLOW_RUNS: 500, AI_TOKENS: 2_000_000 },
      'STARTER',
      '2026-03',
    );
    expect(statement.meters).toHaveLength(4); // all four meters reported
    // API_REQUESTS overage 50k*0.01=500; WORKFLOW_RUNS within allowance (no line); AI_TOKENS 1M over *0.0002=200.
    expect(statement.lineItems.map((item) => item.amount).sort((a, b) => a - b)).toEqual([
      200, 500,
    ]);
    expect(statement.totalAmountMinor).toBe(700);
    expect(statement.lineItems.every((item) => item.amount > 0)).toBe(true);
  });

  it('bills nothing on ENTERPRISE however high the usage', () => {
    const statement = buildUsageStatement(
      { API_REQUESTS: 10_000_000, AI_TOKENS: 999_999_999 },
      'ENTERPRISE',
      '2026-03',
    );
    expect(statement.lineItems).toEqual([]);
    expect(statement.totalAmountMinor).toBe(0);
    expect(statement.meters).toHaveLength(4);
  });
});

describe('RecordUsageSchema', () => {
  it('accepts a positive integer increment and rejects junk', () => {
    expect(RecordUsageSchema.safeParse({ meter: 'API_REQUESTS', quantity: 5 }).success).toBe(true);
    expect(RecordUsageSchema.safeParse({ meter: 'API_REQUESTS', quantity: 0 }).success).toBe(false);
    expect(RecordUsageSchema.safeParse({ meter: 'API_REQUESTS', quantity: -1 }).success).toBe(
      false,
    );
    expect(RecordUsageSchema.safeParse({ meter: 'API_REQUESTS', quantity: 1.5 }).success).toBe(
      false,
    );
    expect(RecordUsageSchema.safeParse({ meter: 'NONSENSE', quantity: 5 }).success).toBe(false);
  });
});
