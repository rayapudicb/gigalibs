/** WI-OI-069 — time and attendance rules: punch timing, local dates, weeks and shift pairing. */
import { describe, expect, it } from 'vitest';
import { ADMISSION_REFUSED, AdmissionGate, type EffectivePunch, computeWeek, localDate, punchTiming, weekStart } from './time.rules.js';

let sequence = 0;
function punch(kind: EffectivePunch['kind'], occurredAt: string, workDate = occurredAt.slice(0, 10)): EffectivePunch {
  sequence += 1;
  return { id: `p${String(sequence).padStart(3, '0')}`, kind, occurredAt, workDate, siteRef: 'site-1', bookingId: null };
}

describe('punch timing', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  it('accepts an on-time punch and flags one received over 15 minutes late', () => {
    expect(punchTiming('2026-10-05T11:55:00Z', now)).toEqual({ accepted: true, late: false, delayMinutes: 5 });
    expect(punchTiming('2026-10-05T09:00:00Z', now)).toEqual({ accepted: true, late: true, delayMinutes: 180 });
  });
  it('tolerates two minutes of device clock skew and refuses more', () => {
    expect(punchTiming('2026-10-05T12:01:30Z', now)).toMatchObject({ accepted: true, late: false });
    expect(punchTiming('2026-10-05T12:03:00Z', now)).toEqual({ accepted: false, code: 'WORKFORCE_PUNCH_IN_FUTURE' });
  });
  it('refuses punches older than 31 days', () => {
    expect(punchTiming('2026-09-01T12:00:00Z', now)).toEqual({ accepted: false, code: 'WORKFORCE_PUNCH_TOO_OLD' });
  });
});

describe('dates and weeks', () => {
  it('takes the calendar date in the punch time zone', () => {
    expect(localDate('2026-10-04T23:30:00Z', 'Asia/Kolkata')).toBe('2026-10-05');
    expect(localDate('2026-10-05T02:00:00Z', 'America/New_York')).toBe('2026-10-04');
  });
  it('starts weeks on Monday', () => {
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
  });
});

describe('computeWeek', () => {
  const monday = '2026-10-05';

  it('pairs a shift with a break and totals worked minutes', () => {
    const week = computeWeek(
      [
        punch('CLOCK_IN', '2026-10-05T08:00:00Z'),
        punch('BREAK_START', '2026-10-05T12:00:00Z'),
        punch('BREAK_END', '2026-10-05T12:30:00Z'),
        punch('CLOCK_OUT', '2026-10-05T16:30:00Z'),
      ],
      monday,
    );
    expect(week.issues).toEqual([]);
    expect(week.lines).toHaveLength(1);
    expect(week.lines[0]).toMatchObject({ workDate: monday, breakMinutes: 30, workedMinutes: 480 });
    expect(week.workedMinutes).toBe(480);
  });

  it('keeps an overnight shift on its clock-in day, across the week end', () => {
    const week = computeWeek(
      [punch('CLOCK_IN', '2026-10-11T22:00:00Z', '2026-10-11'), punch('CLOCK_OUT', '2026-10-12T06:00:00Z', '2026-10-12')],
      monday,
    );
    expect(week.issues).toEqual([]);
    expect(week.lines).toEqual([expect.objectContaining({ workDate: '2026-10-11', workedMinutes: 480 })]);
    const next = computeWeek(
      [punch('CLOCK_IN', '2026-10-11T22:00:00Z', '2026-10-11'), punch('CLOCK_OUT', '2026-10-12T06:00:00Z', '2026-10-12')],
      '2026-10-12',
    );
    expect(next).toMatchObject({ lines: [], issues: [] });
  });

  it('reports unpaired and out-of-order punches in the week they happen', () => {
    const week = computeWeek(
      [
        punch('CLOCK_OUT', '2026-10-05T07:00:00Z'),
        punch('CLOCK_IN', '2026-10-06T08:00:00Z'),
        punch('CLOCK_IN', '2026-10-06T09:00:00Z'),
        punch('BREAK_END', '2026-10-06T10:00:00Z'),
        punch('CLOCK_OUT', '2026-10-06T16:00:00Z'),
        punch('BREAK_START', '2026-10-07T10:00:00Z'),
        punch('CLOCK_IN', '2026-10-08T08:00:00Z'),
      ],
      monday,
    );
    expect(week.issues.map((item) => item.code)).toEqual([
      'CLOCK_OUT_WITHOUT_IN',
      'CLOCK_IN_WHILE_OPEN',
      'BREAK_END_WITHOUT_START',
      'BREAK_WITHOUT_SHIFT',
      'MISSING_CLOCK_OUT',
    ]);
    expect(week.lines).toHaveLength(1);
  });

  it('closes a forgotten shift when the next clock-in is a day later', () => {
    const week = computeWeek(
      [punch('CLOCK_IN', '2026-10-05T08:00:00Z'), punch('CLOCK_IN', '2026-10-06T09:00:00Z'), punch('CLOCK_OUT', '2026-10-06T17:00:00Z')],
      monday,
    );
    expect(week.issues.map((item) => [item.code, item.workDate])).toEqual([['MISSING_CLOCK_OUT', '2026-10-05']]);
    expect(week.lines).toEqual([expect.objectContaining({ workDate: '2026-10-06', workedMinutes: 480 })]);
  });

  it('ignores a previous week problem and refuses an unended break', () => {
    const week = computeWeek(
      [
        punch('CLOCK_IN', '2026-10-04T08:00:00Z', '2026-10-04'),
        punch('CLOCK_IN', '2026-10-05T09:00:00Z'),
        punch('BREAK_START', '2026-10-05T12:00:00Z'),
        punch('CLOCK_OUT', '2026-10-05T17:00:00Z'),
      ],
      monday,
    );
    expect(week.issues.map((item) => item.code)).toEqual(['BREAK_NOT_ENDED']);
    expect(week.lines).toEqual([]);
  });
});

describe('AdmissionGate', () => {
  it('refuses work beyond the limit and admits again once work finishes', async () => {
    const gate = new AdmissionGate(2);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const first = gate.run(() => blocked);
    const second = gate.run(() => blocked);
    await expect(gate.run(async () => 'third')).resolves.toBe(ADMISSION_REFUSED);
    release();
    await Promise.all([first, second]);
    await expect(gate.run(async () => 'later')).resolves.toBe('later');
    expect(gate.inFlight).toBe(0);
  });
});
