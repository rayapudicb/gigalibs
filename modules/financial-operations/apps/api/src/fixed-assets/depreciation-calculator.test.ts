import { describe, expect, it } from 'vitest';
import {
  calculateDepreciationSchedule,
  type SchedulePeriodInput,
} from './depreciation-calculator.js';

describe('Depreciation Calculator Engine', () => {
  function makePeriods(count: number): SchedulePeriodInput[] {
    return Array.from({ length: count }, (_, i) => ({
      periodId: `period-uuid-${i + 1}`,
      periodNumber: i + 1,
      scheduleDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-28`,
    }));
  }

  it('calculates Straight-Line depreciation with exact cent conservation', () => {
    // $10,000.00 acquisition cost, $1,000.00 salvage value over 3 months
    // Depreciable basis = $9,000.00 = 900,000 minor units
    // Monthly = 300,000 minor units
    const periods = makePeriods(3);
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: '1000000',
      salvageValueMinor: '100000',
      usefulLifeMonths: 3,
      depreciationMethod: 'STRAIGHT_LINE',
      periods,
    });

    expect(schedule).toHaveLength(3);
    expect(schedule[0].depreciationAmountMinor).toBe('300000');
    expect(schedule[0].accumulatedDepreciationMinor).toBe('300000');
    expect(schedule[0].bookValueMinor).toBe('700000');

    expect(schedule[1].depreciationAmountMinor).toBe('300000');
    expect(schedule[1].accumulatedDepreciationMinor).toBe('600000');
    expect(schedule[1].bookValueMinor).toBe('400000');

    expect(schedule[2].depreciationAmountMinor).toBe('300000');
    expect(schedule[2].accumulatedDepreciationMinor).toBe('900000');
    expect(schedule[2].bookValueMinor).toBe('100000'); // Exactly salvage value
  });

  it('handles indivisible cent remainders by allocating remainder to final period', () => {
    // $100.00 acquisition cost, $0.00 salvage over 3 months
    // 10,000 / 3 = 3,333 remainder 1
    // Month 1: 3,333
    // Month 2: 3,333
    // Month 3: 3,334
    // Total sum = 10,000 exactly
    const periods = makePeriods(3);
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: '10000',
      salvageValueMinor: '0',
      usefulLifeMonths: 3,
      depreciationMethod: 'STRAIGHT_LINE',
      periods,
    });

    expect(schedule[0].depreciationAmountMinor).toBe('3333');
    expect(schedule[1].depreciationAmountMinor).toBe('3333');
    expect(schedule[2].depreciationAmountMinor).toBe('3334');

    const totalDepr = schedule.reduce((sum, line) => sum + BigInt(line.depreciationAmountMinor), 0n);
    expect(totalDepr.toString()).toBe('10000');
    expect(schedule[2].bookValueMinor).toBe('0');
  });

  it('handles NO_DEPRECIATION method (e.g. Land)', () => {
    const periods = makePeriods(12);
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: '50000000', // $500,000.00
      salvageValueMinor: '50000000',
      usefulLifeMonths: 0,
      depreciationMethod: 'NO_DEPRECIATION',
      periods,
    });

    expect(schedule[0].depreciationAmountMinor).toBe('0');
    expect(schedule[0].bookValueMinor).toBe('50000000');
    expect(schedule[11].bookValueMinor).toBe('50000000');
  });

  it('calculates Declining Balance depreciation correctly', () => {
    // $12,000.00 acquisition cost, $1,200.00 salvage value over 12 months
    const periods = makePeriods(12);
    const schedule = calculateDepreciationSchedule({
      acquisitionCostMinor: '1200000',
      salvageValueMinor: '120000',
      usefulLifeMonths: 12,
      depreciationMethod: 'DECLINING_BALANCE',
      periods,
    });

    expect(schedule).toHaveLength(12);
    // Ending book value must equal salvage value
    expect(schedule[11].bookValueMinor).toBe('120000');
    // Total accumulated depreciation must equal cost - salvage = 1,080,000
    expect(schedule[11].accumulatedDepreciationMinor).toBe('1080000');
  });
});
