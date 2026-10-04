import { describe, expect, it } from 'vitest';
import {
  distributeAnnualBudget,
  evaluateSpendAvailability,
  calculateVariance,
  computeRevisionChecksum,
} from './budgeting-engine.js';

describe('Budgeting Engine Unit Tests', () => {
  describe('distributeAnnualBudget', () => {
    it('distributes evenly divisible budget across 12 periods', () => {
      // 120,000 cents = $1,200.00
      const periods = distributeAnnualBudget('120000', 12, 'EQUAL_MONTHLY');
      expect(periods).toHaveLength(12);
      expect(periods.every((p) => p === '10000')).toBe(true);
      const total = periods.reduce((acc, p) => acc + BigInt(p), 0n);
      expect(total.toString()).toBe('120000');
    });

    it('conserves 100% of cents when division produces a remainder', () => {
      // 100,000 cents / 12 = 8333 with remainder 4 cents
      const periods = distributeAnnualBudget('100000', 12, 'EQUAL_MONTHLY');
      expect(periods).toHaveLength(12);
      expect(periods[0]).toBe('8337'); // 8333 + 4 remainder
      for (let i = 1; i < 12; i++) {
        expect(periods[i]).toBe('8333');
      }
      const total = periods.reduce((acc, p) => acc + BigInt(p), 0n);
      expect(total.toString()).toBe('100000');
    });

    it('conserves cent on single penny across 12 periods', () => {
      const periods = distributeAnnualBudget('1', 12);
      expect(periods[0]).toBe('1');
      for (let i = 1; i < 12; i++) {
        expect(periods[i]).toBe('0');
      }
      const total = periods.reduce((acc, p) => acc + BigInt(p), 0n);
      expect(total.toString()).toBe('1');
    });

    it('handles zero annual budget', () => {
      const periods = distributeAnnualBudget('0', 12);
      expect(periods.every((p) => p === '0')).toBe(true);
      const total = periods.reduce((acc, p) => acc + BigInt(p), 0n);
      expect(total.toString()).toBe('0');
    });
  });

  describe('evaluateSpendAvailability', () => {
    it('approves spend when within available budget', () => {
      const result = evaluateSpendAvailability({
        budgetLineId: '00000000-0000-0000-0000-000000000001',
        allocatedMinorStr: '500000', // $5,000.00
        actualMinorStr: '100000',    // $1,000.00
        encumberedMinorStr: '150000',// $1,500.00
        requestedMinorStr: '200000', // $2,000.00
        controlAction: 'HARD_STOP',
      });

      // Total consumed = 250000, available = 250000, requested = 200000 => resulting = 50000
      expect(result.isAllowed).toBe(true);
      expect(result.availableAmountMinor).toBe('250000');
      expect(result.resultingAvailableMinor).toBe('50000');
    });

    it('rejects spend under HARD_STOP when exceeding budget with zero tolerance', () => {
      const result = evaluateSpendAvailability({
        allocatedMinorStr: '500000', // $5,000.00
        actualMinorStr: '300000',    // $3,000.00
        encumberedMinorStr: '150000',// $1,500.00
        requestedMinorStr: '100000', // $1,000.00 (available is only 50000)
        controlAction: 'HARD_STOP',
        toleranceThresholdPct: 0,
      });

      expect(result.isAllowed).toBe(false);
      expect(result.availableAmountMinor).toBe('50000');
      expect(result.resultingAvailableMinor).toBe('-50000');
      expect(result.message).toContain('rejected');
    });

    it('permits spend when exceeding baseline but within tolerance buffer', () => {
      // Allocated $1,000.00 (100000 cents), 10% tolerance = buffer $100.00 (10000 cents)
      // Actual $800.00, Encumbered $100.00 => available = $100.00
      // Requested $150.00 (exceeds $100.00 available by $50.00, but within $100.00 tolerance)
      const result = evaluateSpendAvailability({
        allocatedMinorStr: '100000',
        actualMinorStr: '80000',
        encumberedMinorStr: '10000',
        requestedMinorStr: '15000',
        controlAction: 'HARD_STOP',
        toleranceThresholdPct: 10,
      });

      expect(result.isAllowed).toBe(true);
      expect(result.resultingAvailableMinor).toBe('-5000');
      expect(result.message).toContain('within 10% tolerance threshold');
    });

    it('rejects spend exceeding both budget and tolerance buffer under HARD_STOP', () => {
      // 10% tolerance on $1,000.00 allows up to $1,100.00 total spend
      // Spent $900.00, Requested $250.00 => Total $1,150.00 > $1,100.00 limit
      const result = evaluateSpendAvailability({
        allocatedMinorStr: '100000',
        actualMinorStr: '90000',
        encumberedMinorStr: '0',
        requestedMinorStr: '25000',
        controlAction: 'HARD_STOP',
        toleranceThresholdPct: 10,
      });

      expect(result.isAllowed).toBe(false);
      expect(result.message).toContain('rejected');
    });

    it('allows spend under ADVISORY_WARN with a warning message', () => {
      const result = evaluateSpendAvailability({
        allocatedMinorStr: '100000',
        actualMinorStr: '90000',
        encumberedMinorStr: '20000', // already consumed 110000
        requestedMinorStr: '10000',
        controlAction: 'ADVISORY_WARN',
      });

      expect(result.isAllowed).toBe(true);
      expect(result.message).toContain('Warning: Spend request exceeds budget limit');
    });

    it('allows spend without restriction when control is DISABLED', () => {
      const result = evaluateSpendAvailability({
        allocatedMinorStr: '100000',
        actualMinorStr: '200000',
        encumberedMinorStr: '0',
        requestedMinorStr: '500000',
        controlAction: 'DISABLED',
      });

      expect(result.isAllowed).toBe(true);
      expect(result.message).toContain('Budget controls are disabled');
    });
  });

  describe('calculateVariance', () => {
    it('computes correct burn rate, variance, and over-budget status', () => {
      const variance = calculateVariance(
        'line-1',
        'acc-1',
        'cc-1',
        'p-1',
        '100000', // $1,000.00 allocated
        '25000',  // $250.00 encumbered
        '50000',  // $500.00 actual
      );

      // Consumed = 75000 cents (75%), Available = 25000 cents
      expect(variance.availableMinor).toBe('25000');
      expect(variance.burnRatePct).toBe(75);
      expect(variance.isOverBudget).toBe(false);
    });

    it('flags over-budget when total consumed exceeds allocated', () => {
      const variance = calculateVariance(
        'line-2',
        'acc-1',
        'cc-1',
        'p-1',
        '100000',
        '50000',
        '60000', // Total 110,000
      );

      expect(variance.burnRatePct).toBe(110);
      expect(variance.isOverBudget).toBe(true);
      expect(variance.availableMinor).toBe('-10000');
    });
  });

  describe('computeRevisionChecksum', () => {
    it('generates identical checksum regardless of line input order', () => {
      const linesA = [
        { fiscalPeriodId: 'fp-2', accountId: 'acc-1', costCenterId: 'cc-1', allocatedAmountMinor: '100' },
        { fiscalPeriodId: 'fp-1', accountId: 'acc-2', costCenterId: 'cc-2', allocatedAmountMinor: '200' },
      ];
      const linesB = [
        { fiscalPeriodId: 'fp-1', accountId: 'acc-2', costCenterId: 'cc-2', allocatedAmountMinor: '200' },
        { fiscalPeriodId: 'fp-2', accountId: 'acc-1', costCenterId: 'cc-1', allocatedAmountMinor: '100' },
      ];

      const hashA = computeRevisionChecksum(1, 'fy-1', linesA);
      const hashB = computeRevisionChecksum(1, 'fy-1', linesB);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });
  });
});
