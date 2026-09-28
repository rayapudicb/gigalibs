/**
 * WI-OI-066 — availability arithmetic and weekly-slot rules. DST expansion, database overlap refusal and the
 * four-eyes flow are certified live by verify-workforce-availability.sh.
 */
import { CreateAvailabilityPatternV1Schema, RequestAbsenceV1Schema, AvailabilityQueryV1Schema } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { computeAvailability, mergeIntervals, weeklyMinutes } from './availability.service.js';

const h = (hours: number) => hours * 3_600_000;
const resourceId = '6d3f1a52-7f5b-4f2a-9a61-1f0b8c1d2e3f';

describe('availability arithmetic', () => {
  it('merges touching and overlapping intervals', () => {
    expect(mergeIntervals([{ start: h(5), end: h(6) }, { start: h(0), end: h(2) }, { start: h(2), end: h(3) }, { start: h(1), end: h(1) }])).toEqual([
      { start: h(0), end: h(3) },
      { start: h(5), end: h(6) },
    ]);
  });

  it('clips to the window and never counts overlapping blockers twice', () => {
    const result = computeAvailability(
      [{ start: h(8), end: h(16) }, { start: h(32), end: h(40) }],
      [
        { start: h(10), end: h(12), reason: 'ABSENCE', label: 'Doctor' },
        { start: h(11), end: h(13), reason: 'CLOSURE', label: 'Holiday' },
      ],
      { start: h(9), end: h(36) },
    );
    expect(result.scheduledMinutes).toBe(7 * 60 + 4 * 60);
    expect(result.blocked).toEqual([
      { start: h(10), end: h(12), reason: 'ABSENCE', label: 'Doctor' },
      { start: h(12), end: h(13), reason: 'CLOSURE', label: 'Holiday' },
    ]);
    expect(result.available).toEqual([{ start: h(9), end: h(10) }, { start: h(13), end: h(16) }, { start: h(32), end: h(36) }]);
    expect(result.availableMinutes).toBe(result.scheduledMinutes - 180);
  });

  it('counts overnight slots across midnight', () => {
    expect(weeklyMinutes([{ day: 'MONDAY', start: '22:00', end: '06:00' }, { day: 'TUESDAY', start: '09:00', end: '24:00' }])).toBe(8 * 60 + 15 * 60);
  });
});

describe('weekly slot rules', () => {
  const pattern = (weeklySlots: unknown[]) =>
    CreateAvailabilityPatternV1Schema.safeParse({ resourceId, effectiveFrom: '2026-10-01', timeZone: 'Asia/Tokyo', weeklySlots });

  it('accepts a normal week and an overnight shift', () => {
    expect(pattern([{ day: 'MONDAY', start: '08:00', end: '16:30' }, { day: 'MONDAY', start: '22:00', end: '06:00' }]).success).toBe(true);
  });

  it('refuses overlaps, including an overnight slot running into the next day and Sunday wrapping into Monday', () => {
    expect(pattern([{ day: 'MONDAY', start: '22:00', end: '06:00' }, { day: 'TUESDAY', start: '05:00', end: '10:00' }]).success).toBe(false);
    expect(pattern([{ day: 'SUNDAY', start: '23:00', end: '02:00' }, { day: 'MONDAY', start: '01:00', end: '04:00' }]).success).toBe(false);
    expect(pattern([{ day: 'MONDAY', start: '08:00', end: '08:00' }]).success).toBe(false);
  });

  it('refuses unknown time zones and malformed times', () => {
    expect(CreateAvailabilityPatternV1Schema.safeParse({ resourceId, effectiveFrom: '2026-10-01', timeZone: 'Mars/Olympus', weeklySlots: [{ day: 'MONDAY', start: '08:00', end: '09:00' }] }).success).toBe(false);
    expect(pattern([{ day: 'MONDAY', start: '8:00', end: '09:00' }]).success).toBe(false);
    expect(pattern([{ day: 'MONDAY', start: '24:00', end: '09:00' }]).success).toBe(false);
  });

  it('bounds absences and availability windows', () => {
    const absence = { resourceId, absenceTypeId: resourceId, startsAt: '2026-10-12T00:00:00+09:00' };
    expect(RequestAbsenceV1Schema.safeParse({ ...absence, endsAt: '2026-10-11T00:00:00+09:00' }).success).toBe(false);
    expect(RequestAbsenceV1Schema.safeParse({ ...absence, endsAt: '2027-12-01T00:00:00+09:00' }).success).toBe(false);
    expect(AvailabilityQueryV1Schema.safeParse({ resourceId, from: '2026-10-01T00:00:00Z', to: '2027-02-01T00:00:00Z' }).success).toBe(false);
  });
});
