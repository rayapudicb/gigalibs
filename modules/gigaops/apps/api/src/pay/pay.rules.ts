import { createHash } from 'node:crypto';
import type { EarningCategoryV1, PayPolicyPackV1 } from '@gigalibs/contracts';

/**
 * Pay policy packs and the deterministic calculator (WI-OI-070, ADR-0008). Pure: the same week, pack version and
 * rates always give the same lines and digest. Money is integer minor units computed with BigInt and rounded
 * half-even once per line; multipliers are basis points.
 */

/**
 * Built-in reference packs. They mirror the rule shapes of the prototype engine and are NOT statutory advice:
 * they stay `reference: true` until a named client's jurisdiction is validated by a payroll SME.
 */
export const PAY_POLICY_PACKS: readonly PayPolicyPackV1[] = Object.freeze([
  Object.freeze({
    code: 'US-CA-OT',
    version: 1,
    jurisdiction: 'US-CA',
    name: 'California daily and weekly overtime (reference)',
    reference: true,
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    rules: Object.freeze({
      dailyRegularMinutes: 480,
      dailyDoubleTimeAfterMinutes: 720,
      weeklyRegularMinutes: 2400,
      overtimeMultiplierBp: 15_000,
      doubleTimeMultiplierBp: 20_000,
      seventhConsecutiveDay: true,
    }),
  }),
  Object.freeze({
    code: 'IN-48',
    version: 1,
    jurisdiction: 'IN',
    name: 'Nine-hour day, 48-hour week at double rate (reference)',
    reference: true,
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    rules: Object.freeze({
      dailyRegularMinutes: 540,
      dailyDoubleTimeAfterMinutes: null,
      weeklyRegularMinutes: 2880,
      overtimeMultiplierBp: 20_000,
      doubleTimeMultiplierBp: null,
      seventhConsecutiveDay: false,
    }),
  }),
]);

/** The pack version in force for a code on a date, or null. */
export function packInForce(code: string, date: string, packs: readonly PayPolicyPackV1[] = PAY_POLICY_PACKS): PayPolicyPackV1 | null {
  return (
    packs
      .filter((pack) => pack.code === code && pack.effectiveFrom <= date && (pack.effectiveTo === null || pack.effectiveTo >= date))
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
}

/** A reference pack is usable only where the deployment explicitly enables reference packs (local and test). */
export function packUsable(pack: PayPolicyPackV1, referencePacksEnabled: boolean): boolean {
  return !pack.reference || referencePacksEnabled;
}

export function findPack(code: string, version: number, packs: readonly PayPolicyPackV1[] = PAY_POLICY_PACKS): PayPolicyPackV1 | null {
  return packs.find((pack) => pack.code === code && pack.version === version) ?? null;
}

export interface WorkedDay {
  readonly workDate: string;
  readonly minutes: number;
}

export interface DayTerms {
  readonly pack: PayPolicyPackV1;
  readonly hourlyRateMinor: number;
  readonly currency: string;
}

export interface CalculatedLine {
  readonly workDate: string;
  readonly category: EarningCategoryV1;
  readonly minutes: number;
  readonly multiplierBp: number;
  readonly hourlyRateMinor: number;
  readonly amountMinor: number;
  readonly currency: string;
  readonly packCode: string;
  readonly packVersion: number;
  readonly ruleTrace: string;
}

/** minutes × hourly rate × multiplier ÷ (60 × 10 000), rounded half-even to a minor unit. */
export function amountMinor(minutes: number, hourlyRateMinor: number, multiplierBp: number): number {
  const numerator = BigInt(minutes) * BigInt(hourlyRateMinor) * BigInt(multiplierBp);
  const denominator = 600_000n;
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twice = remainder * 2n;
  const rounded = twice > denominator || (twice === denominator && quotient % 2n === 1n) ? quotient + 1n : quotient;
  return Number(rounded);
}

/**
 * One person's week (Monday first). Daily limits split each day into regular, daily overtime and double time;
 * regular minutes beyond the weekly limit become weekly overtime (daily overtime never counts twice); on the
 * seventh consecutive worked day the first daily limit is overtime and the rest double time.
 */
export function calculateWeek(days: readonly WorkedDay[], termsFor: (workDate: string) => DayTerms): CalculatedLine[] {
  const ordered = [...days].filter((day) => day.minutes > 0).sort((left, right) => left.workDate.localeCompare(right.workDate));
  const lines: CalculatedLine[] = [];
  let weeklyRegular = 0;
  let consecutive = 0;
  let previous: string | null = null;
  for (const day of ordered) {
    consecutive = previous !== null && nextDay(previous) === day.workDate ? consecutive + 1 : 1;
    previous = day.workDate;
    const terms = termsFor(day.workDate);
    const { rules } = terms.pack;
    const tag = `${terms.pack.code}@${terms.pack.version}`;
    const push = (category: EarningCategoryV1, minutes: number, multiplierBp: number, rule: string) => {
      if (minutes <= 0) return;
      lines.push({
        workDate: day.workDate,
        category,
        minutes,
        multiplierBp,
        hourlyRateMinor: terms.hourlyRateMinor,
        amountMinor: amountMinor(minutes, terms.hourlyRateMinor, multiplierBp),
        currency: terms.currency,
        packCode: terms.pack.code,
        packVersion: terms.pack.version,
        ruleTrace: `${tag} ${rule}`,
      });
    };

    if (rules.seventhConsecutiveDay && consecutive === 7) {
      const limit = rules.dailyRegularMinutes ?? day.minutes;
      push('SEVENTH_DAY_OVERTIME', Math.min(day.minutes, limit), rules.overtimeMultiplierBp, `seventh-day<=${limit}`);
      push('SEVENTH_DAY_DOUBLE_TIME', day.minutes - Math.min(day.minutes, limit), rules.doubleTimeMultiplierBp ?? rules.overtimeMultiplierBp, `seventh-day>${limit}`);
      continue;
    }

    const doubleTime = rules.dailyDoubleTimeAfterMinutes === null ? 0 : Math.max(0, day.minutes - rules.dailyDoubleTimeAfterMinutes);
    const dailyRegular = rules.dailyRegularMinutes === null ? day.minutes - doubleTime : Math.min(day.minutes - doubleTime, rules.dailyRegularMinutes);
    const dailyOvertime = day.minutes - doubleTime - dailyRegular;
    const weeklyRoom = Math.max(0, rules.weeklyRegularMinutes - weeklyRegular);
    const regular = Math.min(dailyRegular, weeklyRoom);
    const weeklyOvertime = dailyRegular - regular;
    weeklyRegular += regular;

    push('REGULAR', regular, 10_000, 'regular');
    push('DAILY_OVERTIME', dailyOvertime, rules.overtimeMultiplierBp, `daily>${rules.dailyRegularMinutes}`);
    push('DAILY_DOUBLE_TIME', doubleTime, rules.doubleTimeMultiplierBp ?? rules.overtimeMultiplierBp, `daily>${rules.dailyDoubleTimeAfterMinutes}`);
    push('WEEKLY_OVERTIME', weeklyOvertime, rules.overtimeMultiplierBp, `weekly>${rules.weeklyRegularMinutes}`);
  }
  return lines;
}

/** SHA-256 over canonical JSON of the run's inputs and lines, independent of key order and row order. */
export function runDigest(input: {
  readonly periodStart: string;
  readonly people: readonly {
    readonly resourceId: string;
    readonly timesheetId: string;
    readonly terms: readonly { readonly workDate: string; readonly packCode: string; readonly packVersion: number; readonly hourlyRateMinor: number; readonly currency: string }[];
    readonly lines: readonly CalculatedLine[];
  }[];
}): string {
  const people = [...input.people]
    .sort((left, right) => left.resourceId.localeCompare(right.resourceId))
    .map((person) => ({
      resourceId: person.resourceId,
      timesheetId: person.timesheetId,
      terms: [...person.terms].sort((left, right) => left.workDate.localeCompare(right.workDate)).map(canonical),
      lines: [...person.lines]
        .sort((left, right) => left.workDate.localeCompare(right.workDate) || left.category.localeCompare(right.category))
        .map(canonical),
    }));
  return createHash('sha256').update(JSON.stringify({ periodStart: input.periodStart, people })).digest('hex');
}

function canonical<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function nextDay(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}
