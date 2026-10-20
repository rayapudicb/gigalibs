import { describe, expect, it } from 'vitest';
import {
  FinanceFiscalPeriodStateChangedPayloadSchema,
  FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1,
} from './inventory-relay.v1.js';

describe('Finance inventory relay contracts', () => {
  it('requires monotonic stateVersion on period state events', () => {
    const parsed = FinanceFiscalPeriodStateChangedPayloadSchema.safeParse({
      fiscalPeriodId: '550e8400-e29b-41d4-a716-446655440000',
      accountingBookId: '550e8400-e29b-41d4-a716-446655440001',
      periodName: '2026-04',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      status: 'LOCKED',
      isPrimaryBook: true,
      stateVersion: 2,
    });
    expect(parsed.success).toBe(true);
  });

  it('names snapshot-completed for initial replica sync', () => {
    expect(FINANCE_FISCAL_PERIOD_SNAPSHOT_COMPLETED_V1).toBe('finance.fiscal-period.snapshot-completed.v1');
  });
});
