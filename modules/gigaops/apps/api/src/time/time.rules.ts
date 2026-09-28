import type { PunchKindV1, TimesheetIssueV1, TimesheetLineV1 } from '@gigalibs/contracts';

/** Rules of time and attendance (WI-OI-069), kept pure so they are tested without a database. */

/** A device clock may run ahead by this much before a punch is refused as being in the future. */
export const FUTURE_TOLERANCE_MS = 2 * 60_000;
/** Received later than this after the device time, a punch is flagged late (for example an offline resend). */
export const LATE_AFTER_MS = 15 * 60_000;
/** Older device punches are refused; a manager records them as a correction instead. */
export const MAX_PUNCH_AGE_MS = 31 * 86_400_000;
/** A shift longer than this is an error, and a new clock-in after it closes the forgotten shift. */
export const MAX_SHIFT_MS = 24 * 3_600_000;

export type PunchTiming =
  | { readonly accepted: true; readonly late: boolean; readonly delayMinutes: number }
  | { readonly accepted: false; readonly code: 'WORKFORCE_PUNCH_IN_FUTURE' | 'WORKFORCE_PUNCH_TOO_OLD' };

export function punchTiming(occurredAt: string, receivedAt: Date): PunchTiming {
  const delay = receivedAt.getTime() - Date.parse(occurredAt);
  if (delay < -FUTURE_TOLERANCE_MS) return { accepted: false, code: 'WORKFORCE_PUNCH_IN_FUTURE' };
  if (delay > MAX_PUNCH_AGE_MS) return { accepted: false, code: 'WORKFORCE_PUNCH_TOO_OLD' };
  return { accepted: true, late: delay > LATE_AFTER_MS, delayMinutes: Math.max(0, Math.round(delay / 60_000)) };
}

/** The calendar date of an instant in an IANA time zone (YYYY-MM-DD). */
export function localDate(instant: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    typeof instant === 'string' ? new Date(instant) : instant,
  );
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The Monday that starts the week of a date. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export interface EffectivePunch {
  readonly id: string;
  readonly kind: PunchKindV1;
  readonly occurredAt: string;
  readonly workDate: string;
  readonly siteRef: string | null;
  readonly bookingId: string | null;
}

export interface WeekComputation {
  readonly lines: readonly TimesheetLineV1[];
  readonly issues: readonly TimesheetIssueV1[];
  readonly workedMinutes: number;
  readonly breakMinutes: number;
}

/**
 * Pairs effective punches into shifts. `punches` must cover the week plus one day either side, so shifts that
 * cross midnight or the week boundary pair correctly; a line belongs to the week of its clock-in, and an issue to
 * the week of the punch it concerns.
 */
export function computeWeek(punches: readonly EffectivePunch[], periodStart: string): WeekComputation {
  const periodEnd = addDays(periodStart, 6);
  const inPeriod = (date: string) => date >= periodStart && date <= periodEnd;
  const ordered = [...punches].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.id.localeCompare(right.id));
  const lines: TimesheetLineV1[] = [];
  const issues: TimesheetIssueV1[] = [];
  const issue = (code: TimesheetIssueV1['code'], punch: EffectivePunch) => {
    if (inPeriod(punch.workDate)) issues.push({ code, punchId: punch.id, workDate: punch.workDate });
  };

  let open: EffectivePunch | null = null;
  let breakStart: EffectivePunch | null = null;
  let breakMs = 0;
  for (const punch of ordered) {
    const at = Date.parse(punch.occurredAt);
    switch (punch.kind) {
      case 'CLOCK_IN':
        if (open) {
          if (at - Date.parse(open.occurredAt) > MAX_SHIFT_MS) issue('MISSING_CLOCK_OUT', open);
          else {
            issue('CLOCK_IN_WHILE_OPEN', punch);
            break;
          }
        }
        open = punch;
        breakStart = null;
        breakMs = 0;
        break;
      case 'BREAK_START':
        if (!open) issue('BREAK_WITHOUT_SHIFT', punch);
        else if (breakStart) issue('BREAK_ALREADY_STARTED', punch);
        else breakStart = punch;
        break;
      case 'BREAK_END':
        if (!open) issue('BREAK_WITHOUT_SHIFT', punch);
        else if (!breakStart) issue('BREAK_END_WITHOUT_START', punch);
        else {
          breakMs += at - Date.parse(breakStart.occurredAt);
          breakStart = null;
        }
        break;
      case 'CLOCK_OUT': {
        if (!open) {
          issue('CLOCK_OUT_WITHOUT_IN', punch);
          break;
        }
        const clockIn: EffectivePunch = open;
        const duration = at - Date.parse(clockIn.occurredAt);
        if (breakStart) issue('BREAK_NOT_ENDED', breakStart);
        else if (duration > MAX_SHIFT_MS) issue('SHIFT_TOO_LONG', clockIn);
        else if (inPeriod(clockIn.workDate)) {
          const breakMinutes = Math.round(breakMs / 60_000);
          lines.push({
            workDate: clockIn.workDate,
            clockInPunchId: clockIn.id,
            clockOutPunchId: punch.id,
            clockInAt: new Date(clockIn.occurredAt).toISOString(),
            clockOutAt: new Date(punch.occurredAt).toISOString(),
            breakMinutes,
            workedMinutes: Math.max(0, Math.round(duration / 60_000) - breakMinutes),
            siteRef: clockIn.siteRef,
            bookingId: clockIn.bookingId,
          });
        }
        open = null;
        breakStart = null;
        breakMs = 0;
        break;
      }
    }
  }
  if (open) issue('MISSING_CLOCK_OUT', open);

  return {
    lines,
    issues,
    workedMinutes: lines.reduce((total, line) => total + line.workedMinutes, 0),
    breakMinutes: lines.reduce((total, line) => total + line.breakMinutes, 0),
  };
}

/** Bounded in-process admission for punch transactions; beyond the limit the caller answers 429. */
export class AdmissionGate {
  private active = 0;

  constructor(private readonly limit: number) {}

  get inFlight(): number {
    return this.active;
  }

  async run<T>(work: () => Promise<T>): Promise<T | typeof ADMISSION_REFUSED> {
    if (this.active >= this.limit) return ADMISSION_REFUSED;
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
    }
  }
}

export const ADMISSION_REFUSED = Symbol('ADMISSION_REFUSED');
