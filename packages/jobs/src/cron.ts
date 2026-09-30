/**
 * Five-field cron (WI-OI-104c): minute, hour, day of month, month, day of week, evaluated in an IANA time zone.
 *
 * Supported per field: `*`, numbers, ranges `a-b`, lists `a,b`, steps `*\/n` and `a-b/n`; month and weekday names
 * (JAN–DEC, SUN–SAT). Day of week 0 and 7 are Sunday. As in classic cron, when both day of month and day of week are
 * restricted, a day matches if either does. A local time that a daylight-saving change skips does not run that day.
 */

export class CronExpressionError extends Error {}

interface FieldSpec {
  readonly min: number;
  readonly max: number;
  readonly names?: readonly string[];
}

const FIELDS: readonly FieldSpec[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] },
  { min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] },
];

export interface CronSchedule {
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly daysOfMonth: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly daysOfWeek: ReadonlySet<number>;
  readonly dayOfMonthRestricted: boolean;
  readonly dayOfWeekRestricted: boolean;
}

export function parseCron(expression: string): CronSchedule {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new CronExpressionError('A schedule needs five fields: minute hour day-of-month month day-of-week.');
  const sets = parts.map((part, index) => parseField(part, FIELDS[index]!, index));
  const daysOfWeek = new Set([...sets[4]!].map((day) => (day === 7 ? 0 : day)));
  return {
    minutes: sets[0]!,
    hours: sets[1]!,
    daysOfMonth: sets[2]!,
    months: sets[3]!,
    daysOfWeek,
    dayOfMonthRestricted: parts[2] !== '*',
    dayOfWeekRestricted: parts[4] !== '*',
  };
}

function parseField(text: string, spec: FieldSpec, index: number): Set<number> {
  const values = new Set<number>();
  for (const piece of text.split(',')) {
    const [range, stepText] = piece.split('/');
    if (range === undefined || range === '' || piece.split('/').length > 2) throw fieldError(text, index);
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) throw fieldError(text, index);
    let from: number;
    let to: number;
    if (range === '*') {
      from = spec.min;
      to = spec.max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      from = value(a ?? '', spec, text, index);
      to = value(b ?? '', spec, text, index);
    } else {
      from = value(range, spec, text, index);
      to = stepText === undefined ? from : spec.max;
    }
    if (from > to) throw fieldError(text, index);
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return values;
}

function value(text: string, spec: FieldSpec, field: string, index: number): number {
  const named = spec.names?.indexOf(text.toUpperCase()) ?? -1;
  const number = named >= 0 ? named + (spec.min === 1 ? 1 : 0) : /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isInteger(number) || number < spec.min || number > spec.max) throw fieldError(field, index);
  return number;
}

function fieldError(text: string, index: number): CronExpressionError {
  const names = ['minute', 'hour', 'day of month', 'month', 'day of week'];
  return new CronExpressionError(`Invalid ${names[index]} field '${text}'.`);
}

/** Throws unless `timeZone` is a valid IANA zone. */
export function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
  } catch {
    throw new CronExpressionError(`Unknown time zone '${timeZone}'.`);
  }
}

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const;

function localParts(formatter: Intl.DateTimeFormat, instant: number) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY[parts.weekday as keyof typeof WEEKDAY],
  };
}

/** The first minute strictly after `after` that the schedule matches in `timeZone`, within two years. */
export function nextCronRun(schedule: CronSchedule, after: Date, timeZone = 'UTC'): Date {
  assertTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  });
  const MINUTE = 60_000;
  let instant = Math.floor(after.getTime() / MINUTE) * MINUTE + MINUTE;
  const limit = after.getTime() + 2 * 366 * 24 * 60 * MINUTE;
  while (instant <= limit) {
    const local = localParts(formatter, instant);
    const domMatch = schedule.daysOfMonth.has(local.day);
    const dowMatch = schedule.daysOfWeek.has(local.weekday);
    const dayMatch =
      schedule.dayOfMonthRestricted && schedule.dayOfWeekRestricted ? domMatch || dowMatch : domMatch && dowMatch;
    if (!schedule.months.has(local.month) || !dayMatch) {
      // Skip to the next local day: most of a year is rejected here, one day at a time.
      instant += ((23 - local.hour) * 60 + (60 - local.minute)) * MINUTE;
      continue;
    }
    if (!schedule.hours.has(local.hour)) {
      instant += (60 - local.minute) * MINUTE;
      continue;
    }
    if (schedule.minutes.has(local.minute)) return new Date(instant);
    instant += MINUTE;
  }
  throw new CronExpressionError('The schedule never runs within the next two years.');
}
