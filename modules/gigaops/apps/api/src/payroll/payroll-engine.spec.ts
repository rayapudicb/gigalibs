import { describe, expect, it } from 'vitest';
import {
  type DayInput,
  PAY_TYPE_CONFIGS,
  calculateWeekPay,
} from './payroll-engine.js';

describe('GigaOps Pure Payroll Engine', () => {
  const caConfig = PAY_TYPE_CONFIGS['8ST_8OT'];
  const stdConfig = PAY_TYPE_CONFIGS['10ST'];

  const createDay = (
    dateStr: string,
    hours: number,
    options: Partial<DayInput> = {},
  ): DayInput => {
    const date = new Date(dateStr);
    return {
      date,
      dayOfWeekInPeriod: date.getUTCDay(),
      effectiveMinutes: Math.round(hours * 60),
      lunchMinutes: 0,
      isHoliday: false,
      isGuaranteedDay: false,
      useGuaranteedHours: false,
      guaranteedMinutes: 0,
      rateAmount: 80, // default $80/hr
      excludePayroll: false,
      isVendorPay: false,
      rateType: 'HOURLY',
      ...options,
    };
  };

  describe('California (8ST_8OT) at $80/hr', () => {
    it('1. 6hr day -> regularPay=$480, otPay=$0, grandTotal=$480', () => {
      const days = [createDay('2026-10-01', 6)];
      const result = calculateWeekPay(days, caConfig);
      expect(result.totalRegularPay).toBe(480);
      expect(result.totalDailyOtPay).toBe(0);
      expect(result.grandTotal).toBe(480);
    });

    it('2. 9hr day -> regularPay=$640, otPay=$120, grandTotal=$760', () => {
      const days = [createDay('2026-10-01', 9)];
      const result = calculateWeekPay(days, caConfig);
      expect(result.totalRegularPay).toBe(640);
      expect(result.totalDailyOtPay).toBe(120);
      expect(result.grandTotal).toBe(760);
    });

    it('3. 15hr day -> regularPay=$640, otPay=$480, dtPay=$480, total=$1,600', () => {
      const days = [createDay('2026-10-01', 15)];
      const result = calculateWeekPay(days, caConfig);
      expect(result.totalRegularPay).toBe(640);
      expect(result.totalDailyOtPay).toBe(480); // 4 hrs * 80 * 1.5 = 480
      expect(result.totalDailyDtPay).toBe(480); // 3 hrs * 80 * 2.0 = 480
      expect(result.grandTotal).toBe(1600); // 640 + 480 + 480 = 1600
    });

    it('4. 0hr no-show -> grandTotal=$0', () => {
      const days = [createDay('2026-10-01', 0)];
      const result = calculateWeekPay(days, caConfig);
      expect(result.grandTotal).toBe(0);
    });

    it('5. 13hr day -> grandTotal=$1,280', () => {
      const days = [createDay('2026-10-01', 13)];
      const result = calculateWeekPay(days, caConfig);
      // 8h reg ($640) + 4h OT ($480) + 1h DT ($160) = $1,280
      expect(result.grandTotal).toBe(1280);
    });

    it('6. Guaranteed 10hr (clocked 8) -> pays 10hr -> grandTotal=$880', () => {
      // In GigaOps, effectiveMinutes is already max(clocked, guaranteed) = 10hr
      const days = [
        createDay('2026-10-01', 10, {
          isGuaranteedDay: true,
          useGuaranteedHours: true,
          guaranteedMinutes: 600,
        }),
      ];
      const result = calculateWeekPay(days, caConfig);
      // 8h reg ($640) + 2h OT ($240) = $880
      expect(result.grandTotal).toBe(880);
    });

    it('7. 7-day week (day 7 = all OT) -> day7.dailyOtHours=8, day7.regularHours=0', () => {
      const days = [
        createDay('2026-10-01', 8),
        createDay('2026-10-02', 8),
        createDay('2026-10-03', 8),
        createDay('2026-10-04', 8),
        createDay('2026-10-05', 8),
        createDay('2026-10-06', 8),
        createDay('2026-10-07', 8),
      ];
      const result = calculateWeekPay(days, caConfig);
      const day7 = result.dailyBreakdowns[6];
      expect(day7.isSeventhDay).toBe(true);
      expect(day7.dailyOtHours).toBe(8);
      expect(day7.regularHours).toBe(0);
    });

    it('8. Holiday 8hr -> totalHolidayPay=$960 (8 x $80 x 1.5)', () => {
      const days = [createDay('2026-10-01', 8, { isHoliday: true })];
      const result = calculateWeekPay(days, caConfig);
      expect(result.totalHolidayPay).toBe(960);
      expect(result.grandTotal).toBe(960);
    });

    it('9. Holiday 12hr -> totalHolidayPay=$1,600 (8 x $120 + 4 x $160)', () => {
      const days = [createDay('2026-10-01', 12, { isHoliday: true })];
      const result = calculateWeekPay(days, caConfig);
      expect(result.totalHolidayPay).toBe(1600);
      expect(result.grandTotal).toBe(1600);
    });

    it('10. excludePayroll -> grandTotal=$0', () => {
      const days = [createDay('2026-10-01', 8, { excludePayroll: true })];
      const result = calculateWeekPay(days, caConfig);
      expect(result.grandTotal).toBe(0);
    });

    it('11. isVendorPay -> grandTotal=$0', () => {
      const days = [createDay('2026-10-01', 8, { isVendorPay: true })];
      const result = calculateWeekPay(days, caConfig);
      expect(result.grandTotal).toBe(0);
    });
  });

  describe('Non-CA 10ST at $30/hr', () => {
    it('12. 10hr day -> regularPay=$300, otPay=$0', () => {
      const days = [createDay('2026-10-01', 10, { rateAmount: 30 })];
      const result = calculateWeekPay(days, stdConfig);
      expect(result.totalRegularPay).toBe(300);
      expect(result.totalDailyOtPay).toBe(0);
      expect(result.grandTotal).toBe(300);
    });

    it('13. 13hr day -> regularPay=$300, otPay=$135', () => {
      const days = [createDay('2026-10-01', 13, { rateAmount: 30 })];
      const result = calculateWeekPay(days, stdConfig);
      expect(result.totalRegularPay).toBe(300);
      expect(result.totalDailyOtPay).toBe(135); // 3 * 30 * 1.5 = 135
      expect(result.grandTotal).toBe(435);
    });

    it('14. 5 days x 10hr -> totalRegularHours=40, totalWeeklyOtHours=10', () => {
      const days = [
        createDay('2026-10-01', 10, { rateAmount: 30 }),
        createDay('2026-10-02', 10, { rateAmount: 30 }),
        createDay('2026-10-03', 10, { rateAmount: 30 }),
        createDay('2026-10-04', 10, { rateAmount: 30 }),
        createDay('2026-10-05', 10, { rateAmount: 30 }),
      ];
      const result = calculateWeekPay(days, stdConfig);
      expect(result.totalRegularHours).toBe(40);
      expect(result.totalWeeklyOtHours).toBe(10);
      // 40h @ $30 ($1,200) + 10h @ $45 ($450) = $1,650
      expect(result.grandTotal).toBe(1650);
    });
  });

  describe('Flat Rate Pay', () => {
    it('15. FLAT_DAILY $500, 2hr worked -> totalFlatPay=$500', () => {
      const days = [
        createDay('2026-10-01', 2, {
          rateType: 'FLAT_DAILY',
          flatAmount: 500,
        }),
      ];
      const result = calculateWeekPay(days, PAY_TYPE_CONFIGS['FLAT_D']);
      expect(result.totalFlatPay).toBe(500);
      expect(result.grandTotal).toBe(500);
    });
  });
});
