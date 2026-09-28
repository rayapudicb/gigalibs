/** WI-OI-070 — golden tests for the reference packs and the deterministic calculator (ADR-0008). */
import { describe, expect, it, vi } from 'vitest';
import { type DayTerms, type WorkedDay, amountMinor, calculateWeek, findPack, packInForce, runDigest } from './pay.rules.js';

const CA = findPack('US-CA-OT', 1)!;
const IN = findPack('IN-48', 1)!;
const caTerms: DayTerms = { pack: CA, hourlyRateMinor: 2_000, currency: 'USD' }; // $20.00 an hour
const inTerms: DayTerms = { pack: IN, hourlyRateMinor: 20_000, currency: 'INR' }; // ₹200.00 an hour
const week = (...minutes: number[]): WorkedDay[] =>
  minutes.map((value, index) => ({ workDate: `2026-10-${String(5 + index).padStart(2, '0')}`, minutes: value }));
const summary = (lines: ReturnType<typeof calculateWeek>) => lines.map((line) => [line.workDate.slice(8), line.category, line.minutes, line.amountMinor]);

describe('amountMinor', () => {
  it('is exact and rounds half-even once per line', () => {
    expect(amountMinor(480, 2_000, 10_000)).toBe(16_000);
    expect(amountMinor(1, 1, 10_000)).toBe(0);
    expect(amountMinor(30, 1, 10_000)).toBe(0); // 0.5 → 0
    expect(amountMinor(90, 1, 10_000)).toBe(2); // 1.5 → 2
    expect(amountMinor(150, 1, 10_000)).toBe(2); // 2.5 → 2
    expect(amountMinor(45, 3_333, 15_000)).toBe(3_750); // 3749.625 → 3750
    expect(amountMinor(2_000_000, 100_000_000, 20_000)).toBe(6_666_666_666_667);
  });
});

describe('US-CA-OT reference pack', () => {
  it('splits a 10-hour day into 8 regular and 2 daily overtime hours', () => {
    expect(summary(calculateWeek(week(600), () => caTerms))).toEqual([
      ['05', 'REGULAR', 480, 16_000],
      ['05', 'DAILY_OVERTIME', 120, 6_000],
    ]);
  });

  it('pays double time after 12 hours in a day', () => {
    expect(summary(calculateWeek(week(780), () => caTerms))).toEqual([
      ['05', 'REGULAR', 480, 16_000],
      ['05', 'DAILY_OVERTIME', 240, 12_000],
      ['05', 'DAILY_DOUBLE_TIME', 60, 4_000],
    ]);
  });

  it('counts only regular time toward the 40-hour week', () => {
    const lines = calculateWeek(week(540, 540, 540, 540, 540, 480), () => caTerms);
    expect(lines.filter((line) => line.category === 'DAILY_OVERTIME').map((line) => line.minutes)).toEqual([60, 60, 60, 60, 60]);
    expect(summary(lines.filter((line) => line.workDate === '2026-10-10'))).toEqual([['10', 'WEEKLY_OVERTIME', 480, 24_000]]);
    expect(lines.filter((line) => line.category === 'REGULAR').reduce((total, line) => total + line.minutes, 0)).toBe(2_400);
  });

  it('applies the seventh consecutive day rule', () => {
    const lines = calculateWeek(week(360, 360, 360, 360, 360, 360, 600), () => caTerms);
    expect(summary(lines.filter((line) => line.workDate === '2026-10-11'))).toEqual([
      ['11', 'SEVENTH_DAY_OVERTIME', 480, 24_000],
      ['11', 'SEVENTH_DAY_DOUBLE_TIME', 120, 8_000],
    ]);
    expect(lines.find((line) => line.category === 'SEVENTH_DAY_OVERTIME')!.ruleTrace).toBe('US-CA-OT@1 seventh-day<=480');
  });

  it('does not treat a gap week as seven consecutive days', () => {
    const days = week(360, 360, 360, 0, 360, 360, 600);
    expect(calculateWeek(days, () => caTerms).some((line) => line.category.startsWith('SEVENTH'))).toBe(false);
  });
});

describe('IN-48 reference pack', () => {
  it('pays double for time beyond nine hours a day', () => {
    expect(summary(calculateWeek(week(600), () => inTerms))).toEqual([
      ['05', 'REGULAR', 540, 180_000],
      ['05', 'DAILY_OVERTIME', 60, 40_000],
    ]);
  });

  it('turns regular time beyond 48 hours a week into overtime', () => {
    const lines = calculateWeek(week(540, 540, 540, 540, 540, 540), () => inTerms);
    expect(summary(lines.filter((line) => line.workDate === '2026-10-10'))).toEqual([
      ['10', 'REGULAR', 180, 60_000],
      ['10', 'WEEKLY_OVERTIME', 360, 240_000],
    ]);
  });
});

describe('packs and digests', () => {
  it('finds the pack version in force on a date', () => {
    expect(packInForce('US-CA-OT', '2026-10-05')?.version).toBe(1);
    expect(packInForce('US-CA-OT', '2019-12-31')).toBeNull();
    expect(packInForce('NOPE', '2026-10-05')).toBeNull();
    expect(CA.reference && IN.reference).toBe(true);
  });

  it('uses the rate in force on each day', () => {
    const lines = calculateWeek(week(480, 480), (date) => (date === '2026-10-05' ? caTerms : { ...caTerms, hourlyRateMinor: 2_500 }));
    expect(lines.map((line) => line.amountMinor)).toEqual([16_000, 20_000]);
  });

  it('gives the same digest regardless of order, and a different one when any input changes', () => {
    const lines = calculateWeek(week(600, 780), () => caTerms);
    const terms = [
      { workDate: '2026-10-05', packCode: 'US-CA-OT', packVersion: 1, hourlyRateMinor: 2_000, currency: 'USD' },
      { workDate: '2026-10-06', packCode: 'US-CA-OT', packVersion: 1, hourlyRateMinor: 2_000, currency: 'USD' },
    ];
    const a = runDigest({ periodStart: '2026-10-05', people: [{ resourceId: 'r1', timesheetId: 't1', terms, lines }, { resourceId: 'r2', timesheetId: 't2', terms: [], lines: [] }] });
    const b = runDigest({ periodStart: '2026-10-05', people: [{ resourceId: 'r2', timesheetId: 't2', terms: [], lines: [] }, { resourceId: 'r1', timesheetId: 't1', terms: [...terms].reverse(), lines: [...lines].reverse() }] });
    expect(b).toBe(a);
    const changed = calculateWeek(week(600, 780), () => ({ ...caTerms, hourlyRateMinor: 2_001 }));
    expect(runDigest({ periodStart: '2026-10-05', people: [{ resourceId: 'r1', timesheetId: 't1', terms, lines: changed }, { resourceId: 'r2', timesheetId: 't2', terms: [], lines: [] }] })).not.toBe(a);
  });
});

describe('reference pack gating (production safety)', () => {
  it('allows reference packs only where the deployment enables them', async () => {
    const { packUsable } = await import('./pay.rules.js');
    expect(packUsable(CA, false)).toBe(false);
    expect(packUsable(CA, true)).toBe(true);
    expect(packUsable({ ...CA, reference: false }, false)).toBe(true);
  });

  it('refuses a rate on a reference pack before touching the database when reference packs are disabled', async () => {
    const { PayService } = await import('./pay.service.js');
    const database = { withTenantTransaction: vi.fn() };
    const service = new PayService(database as never, { payReferencePacks: false });
    const context = {
      correlationId: 'test',
      principal: { tenantId: 't1', subject: 'u1', permissions: ['workforce:*'], spatialScope: { mode: 'UNBOUNDED' } },
    } as never;
    await expect(service.setRate(context, {
      resourceId: '7a1f3c2e-5b6d-4e8f-9a0b-1c2d3e4f5a6b', packCode: 'US-CA-OT', effectiveFrom: '2026-01-01', hourlyRateMinor: 2_000, currency: 'USD',
    })).rejects.toThrow(/reference pack/);
    expect(database.withTenantTransaction).not.toHaveBeenCalled();
    expect(service.packs().referencePacksEnabled).toBe(false);
  });
});
