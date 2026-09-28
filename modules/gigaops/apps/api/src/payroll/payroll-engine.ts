/**
 * GigaOps Pure Payroll Calculation Engine
 *
 * Implements pure jurisdictional payroll math without database dependencies,
 * network calls, or side effects.
 */

export interface PayTypeConfig {
  code: string;
  dailyRegularCap: number | null; // null for flat rate
  dailyOtCap: number | null;      // null = no DT tier
  weeklyRegularCap: number;
  otMultiplier: number;
  dtMultiplier: number | null;
  seventhDayRule: boolean;
  isCalifornia: boolean;
  holidayRegularCap?: number;
  holidayOtMultiplier?: number;
  holidayDtMultiplier?: number;
  isFlat?: boolean;
}

export interface DayInput {
  date: Date;
  dayOfWeekInPeriod: number; // 0-6
  effectiveMinutes: number;  // net after lunch + guaranteed
  lunchMinutes: number;
  isHoliday: boolean;
  isGuaranteedDay: boolean;
  useGuaranteedHours: boolean;
  guaranteedMinutes: number;
  rateAmount: number;        // hourly rate (ignored for flat)
  excludePayroll: boolean;   // -> gross = $0
  isVendorPay: boolean;      // -> gross = $0
  rateType: 'HOURLY' | 'FLAT_DAILY' | 'FLAT_WEEKLY' | 'FLAT_EVENT';
  flatAmount?: number;
}

export interface DailyPayResult {
  date: Date;
  workDateString: string;
  workedMinutes: number;
  workedHours: number;
  regularHours: number;
  dailyOtHours: number;
  dailyDtHours: number;
  weeklyOtHours: number;
  holidayHours: number;
  regularPay: number;
  dailyOtPay: number;
  dailyDtPay: number;
  weeklyOtPay: number;
  holidayPay: number;
  flatRatePay: number;
  dailyTotal: number;
  isSeventhDay: boolean;
  isHoliday: boolean;
  isGuaranteedDay: boolean;
}

export interface WeekPayResult {
  dailyBreakdowns: DailyPayResult[];
  totalRegularHours: number;
  totalDailyOtHours: number;
  totalDailyDtHours: number;
  totalWeeklyOtHours: number;
  totalHolidayHours: number;
  totalRegularPay: number;
  totalDailyOtPay: number;
  totalDailyDtPay: number;
  totalWeeklyOtPay: number;
  totalHolidayPay: number;
  totalFlatPay: number;
  grandTotal: number;
}

export const PAY_TYPE_CONFIGS: Record<string, PayTypeConfig> = {
  '10ST': {
    code: '10ST',
    dailyRegularCap: 10,
    dailyOtCap: null,
    weeklyRegularCap: 40,
    otMultiplier: 1.5,
    dtMultiplier: null,
    seventhDayRule: false,
    isCalifornia: false,
    holidayRegularCap: 10,
    holidayOtMultiplier: 1.5,
    holidayDtMultiplier: 2.0,
    isFlat: false,
  },
  '9ST_OT9': {
    code: '9ST_OT9',
    dailyRegularCap: 9,
    dailyOtCap: null,
    weeklyRegularCap: 40,
    otMultiplier: 1.5,
    dtMultiplier: null,
    seventhDayRule: false,
    isCalifornia: false,
    holidayRegularCap: 9,
    holidayOtMultiplier: 1.5,
    holidayDtMultiplier: 2.0,
    isFlat: false,
  },
  '8ST_8OT': {
    code: '8ST_8OT',
    dailyRegularCap: 8,
    dailyOtCap: 12,
    weeklyRegularCap: 40,
    otMultiplier: 1.5,
    dtMultiplier: 2.0,
    seventhDayRule: true,
    isCalifornia: true,
    holidayRegularCap: 8,
    holidayOtMultiplier: 1.5,
    holidayDtMultiplier: 2.0,
    isFlat: false,
  },
  'INDIA_48': {
    code: 'INDIA_48',
    dailyRegularCap: 9,
    dailyOtCap: null,
    weeklyRegularCap: 48,
    otMultiplier: 2.0,
    dtMultiplier: 2.0,
    seventhDayRule: false,
    isCalifornia: false,
    holidayRegularCap: 9,
    holidayOtMultiplier: 2.0,
    holidayDtMultiplier: 2.0,
    isFlat: false,
  },
  'FLAT_D': {
    code: 'FLAT_D',
    dailyRegularCap: null,
    dailyOtCap: null,
    weeklyRegularCap: 0,
    otMultiplier: 1.0,
    dtMultiplier: null,
    seventhDayRule: false,
    isCalifornia: false,
    isFlat: true,
  },
  'FLAT_W': {
    code: 'FLAT_W',
    dailyRegularCap: null,
    dailyOtCap: null,
    weeklyRegularCap: 0,
    otMultiplier: 1.0,
    dtMultiplier: null,
    seventhDayRule: false,
    isCalifornia: false,
    isFlat: true,
  },
  'FLAT_E': {
    code: 'FLAT_E',
    dailyRegularCap: null,
    dailyOtCap: null,
    weeklyRegularCap: 0,
    otMultiplier: 1.0,
    dtMultiplier: null,
    seventhDayRule: false,
    isCalifornia: false,
    isFlat: true,
  },
};

/**
 * Calculates pay for a period of days for a single position/worker.
 */
export function calculateWeekPay(days: DayInput[], config: PayTypeConfig): WeekPayResult {
  const sortedDays = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
  const dailyBreakdowns: DailyPayResult[] = [];

  let accumulatedRegularHours = 0;
  let consecutiveWorkedDays = 0;

  for (let i = 0; i < sortedDays.length; i++) {
    const day = sortedDays[i];
    const workedHours = day.effectiveMinutes / 60;
    const isWorked = workedHours > 0;

    if (isWorked) {
      consecutiveWorkedDays++;
    } else {
      consecutiveWorkedDays = 0;
    }

    const isSeventhDay = config.seventhDayRule && consecutiveWorkedDays === 7;

    // Check exclude or vendor pay
    if (day.excludePayroll || day.isVendorPay) {
      dailyBreakdowns.push({
        date: day.date,
        workDateString: day.date.toISOString().slice(0, 10),
        workedMinutes: day.effectiveMinutes,
        workedHours,
        regularHours: 0,
        dailyOtHours: 0,
        dailyDtHours: 0,
        weeklyOtHours: 0,
        holidayHours: 0,
        regularPay: 0,
        dailyOtPay: 0,
        dailyDtPay: 0,
        weeklyOtPay: 0,
        holidayPay: 0,
        flatRatePay: 0,
        dailyTotal: 0,
        isSeventhDay: false,
        isHoliday: day.isHoliday,
        isGuaranteedDay: day.isGuaranteedDay,
      });
      continue;
    }

    // Flat rate handling
    if (
      config.isFlat ||
      day.rateType === 'FLAT_DAILY' ||
      day.rateType === 'FLAT_WEEKLY' ||
      day.rateType === 'FLAT_EVENT'
    ) {
      const flatPay = day.flatAmount ?? day.rateAmount;
      dailyBreakdowns.push({
        date: day.date,
        workDateString: day.date.toISOString().slice(0, 10),
        workedMinutes: day.effectiveMinutes,
        workedHours,
        regularHours: 0,
        dailyOtHours: 0,
        dailyDtHours: 0,
        weeklyOtHours: 0,
        holidayHours: 0,
        regularPay: 0,
        dailyOtPay: 0,
        dailyDtPay: 0,
        weeklyOtPay: 0,
        holidayPay: 0,
        flatRatePay: flatPay,
        dailyTotal: flatPay,
        isSeventhDay: false,
        isHoliday: day.isHoliday,
        isGuaranteedDay: day.isGuaranteedDay,
      });
      continue;
    }

    // Holiday calculation
    if (day.isHoliday) {
      const holCap = config.holidayRegularCap ?? config.dailyRegularCap ?? 8;
      const otMult = config.holidayOtMultiplier ?? 1.5;
      const dtMult = config.holidayDtMultiplier ?? 2.0;

      let holPay = 0;
      if (workedHours <= holCap) {
        holPay = workedHours * day.rateAmount * otMult;
      } else {
        holPay =
          holCap * day.rateAmount * otMult +
          (workedHours - holCap) * day.rateAmount * dtMult;
      }

      dailyBreakdowns.push({
        date: day.date,
        workDateString: day.date.toISOString().slice(0, 10),
        workedMinutes: day.effectiveMinutes,
        workedHours,
        regularHours: 0,
        dailyOtHours: 0,
        dailyDtHours: 0,
        weeklyOtHours: 0,
        holidayHours: workedHours,
        regularPay: 0,
        dailyOtPay: 0,
        dailyDtPay: 0,
        weeklyOtPay: 0,
        holidayPay: holPay,
        flatRatePay: 0,
        dailyTotal: holPay,
        isSeventhDay: false,
        isHoliday: true,
        isGuaranteedDay: day.isGuaranteedDay,
      });
      continue;
    }

    // 7th Day Rule (e.g. California)
    if (isSeventhDay) {
      const firstTierHours = Math.min(workedHours, 8);
      const secondTierHours = Math.max(workedHours - 8, 0);

      const otPay = firstTierHours * day.rateAmount * config.otMultiplier;
      const dtPay = secondTierHours * day.rateAmount * (config.dtMultiplier ?? config.otMultiplier);
      const total = otPay + dtPay;

      dailyBreakdowns.push({
        date: day.date,
        workDateString: day.date.toISOString().slice(0, 10),
        workedMinutes: day.effectiveMinutes,
        workedHours,
        regularHours: 0,
        dailyOtHours: firstTierHours,
        dailyDtHours: secondTierHours,
        weeklyOtHours: 0,
        holidayHours: 0,
        regularPay: 0,
        dailyOtPay: otPay,
        dailyDtPay: dtPay,
        weeklyOtPay: 0,
        holidayPay: 0,
        flatRatePay: 0,
        dailyTotal: total,
        isSeventhDay: true,
        isHoliday: false,
        isGuaranteedDay: day.isGuaranteedDay,
      });
      continue;
    }

    // Standard Daily Tiering
    const dailyRegCap = config.dailyRegularCap ?? 8;
    const dailyOtCap = config.dailyOtCap; // e.g. 12 for CA

    let regHours = 0;
    let otHours = 0;
    let dtHours = 0;

    if (dailyOtCap !== null && dailyOtCap !== undefined) {
      // 3-tier system (e.g., CA 8 / 12 / DT)
      regHours = Math.min(workedHours, dailyRegCap);
      otHours = Math.max(Math.min(workedHours, dailyOtCap) - dailyRegCap, 0);
      dtHours = Math.max(workedHours - dailyOtCap, 0);
    } else {
      // 2-tier system (e.g., 10hr cap)
      regHours = Math.min(workedHours, dailyRegCap);
      otHours = Math.max(workedHours - dailyRegCap, 0);
      dtHours = 0;
    }

    const regPay = regHours * day.rateAmount;
    const otPay = otHours * day.rateAmount * config.otMultiplier;
    const dtPay = dtHours * day.rateAmount * (config.dtMultiplier ?? config.otMultiplier);

    accumulatedRegularHours += regHours;

    dailyBreakdowns.push({
      date: day.date,
      workDateString: day.date.toISOString().slice(0, 10),
      workedMinutes: day.effectiveMinutes,
      workedHours,
      regularHours: regHours,
      dailyOtHours: otHours,
      dailyDtHours: dtHours,
      weeklyOtHours: 0,
      holidayHours: 0,
      regularPay: regPay,
      dailyOtPay: otPay,
      dailyDtPay: dtPay,
      weeklyOtPay: 0,
      holidayPay: 0,
      flatRatePay: 0,
      dailyTotal: regPay + otPay + dtPay,
      isSeventhDay: false,
      isHoliday: false,
      isGuaranteedDay: day.isGuaranteedDay,
    });
  }

  // Weekly regular cap reconciliation (e.g. 40 hours)
  let totalWeeklyOtHours = 0;
  let totalWeeklyOtPay = 0;

  if (config.weeklyRegularCap > 0 && accumulatedRegularHours > config.weeklyRegularCap) {
    const excessRegularHours = accumulatedRegularHours - config.weeklyRegularCap;
    totalWeeklyOtHours = excessRegularHours;

    // Deduct excess from daily regular hours backwards to adjust rates
    let remainingToReclassify = excessRegularHours;
    for (let i = dailyBreakdowns.length - 1; i >= 0 && remainingToReclassify > 0; i--) {
      const breakdown = dailyBreakdowns[i];
      if (breakdown.regularHours > 0) {
        const reclassifyFromThisDay = Math.min(breakdown.regularHours, remainingToReclassify);
        breakdown.regularHours -= reclassifyFromThisDay;
        breakdown.weeklyOtHours += reclassifyFromThisDay;

        const rate = days[i].rateAmount;
        const reclassifiedPay = reclassifyFromThisDay * rate;
        const weeklyOtPayThisDay = reclassifyFromThisDay * rate * config.otMultiplier;

        breakdown.regularPay -= reclassifiedPay;
        breakdown.weeklyOtPay += weeklyOtPayThisDay;
        breakdown.dailyTotal = breakdown.dailyTotal - reclassifiedPay + weeklyOtPayThisDay;

        totalWeeklyOtPay += weeklyOtPayThisDay;
        remainingToReclassify -= reclassifyFromThisDay;
      }
    }
  }

  // Aggregate totals
  const totalRegularHours = dailyBreakdowns.reduce((sum, d) => sum + d.regularHours, 0);
  const totalDailyOtHours = dailyBreakdowns.reduce((sum, d) => sum + d.dailyOtHours, 0);
  const totalDailyDtHours = dailyBreakdowns.reduce((sum, d) => sum + d.dailyDtHours, 0);
  const totalHolidayHours = dailyBreakdowns.reduce((sum, d) => sum + d.holidayHours, 0);

  const totalRegularPay = dailyBreakdowns.reduce((sum, d) => sum + d.regularPay, 0);
  const totalDailyOtPay = dailyBreakdowns.reduce((sum, d) => sum + d.dailyOtPay, 0);
  const totalDailyDtPay = dailyBreakdowns.reduce((sum, d) => sum + d.dailyDtPay, 0);
  const totalHolidayPay = dailyBreakdowns.reduce((sum, d) => sum + d.holidayPay, 0);
  const totalFlatPay = dailyBreakdowns.reduce((sum, d) => sum + d.flatRatePay, 0);
  const grandTotal = dailyBreakdowns.reduce((sum, d) => sum + d.dailyTotal, 0);

  return {
    dailyBreakdowns,
    totalRegularHours,
    totalDailyOtHours,
    totalDailyDtHours,
    totalWeeklyOtHours,
    totalHolidayHours,
    totalRegularPay,
    totalDailyOtPay,
    totalDailyDtPay,
    totalWeeklyOtPay,
    totalHolidayPay,
    totalFlatPay,
    grandTotal,
  };
}
