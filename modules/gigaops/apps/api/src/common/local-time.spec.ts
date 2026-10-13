import { describe, expect, it } from 'vitest';
import { instantOf, localOf } from './local-time.js';

// WI-OI-120u (M-WF1 Slice 2): window times are wall-clock text read in the person's working time zone.
describe('local time in a working time zone', () => {
  it('reads and shows wall-clock time either side of a daylight-saving change', () => {
    expect(instantOf('2026-07-01T09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z');
    expect(instantOf('2026-12-01T09:00', 'Europe/London')).toBe('2026-12-01T09:00:00.000Z');
    expect(instantOf('2026-07-01T09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z');
    expect(instantOf('2026-07-01T09:00', 'Asia/Kolkata')).toBe('2026-07-01T03:30:00.000Z');
    expect(localOf('2026-07-01T08:00:00.000Z', 'Europe/London')).toBe('2026-07-01T09:00');
    expect(localOf('2026-12-31T23:30:00.000Z', 'Asia/Kolkata')).toBe('2027-01-01T05:00');
    expect(localOf('2026-07-01T08:00:00.000Z', 'UTC')).toBe('2026-07-01T08:00');
  });

  it('round-trips every hour of a year in a zone with daylight saving', () => {
    for (let hour = 0; hour < 365 * 24; hour += 1) {
      const instant = new Date(Date.UTC(2026, 0, 1) + hour * 3_600_000).toISOString();
      const local = localOf(instant, 'Europe/Berlin');
      // A wall-clock time that happens twice reads as the first; every other one round-trips exactly.
      expect(Date.parse(instantOf(local, 'Europe/Berlin'))).toBeLessThanOrEqual(
        Date.parse(instant),
      );
      expect(localOf(instantOf(local, 'Europe/Berlin'), 'Europe/Berlin')).toBe(local);
    }
  });

  it('moves a skipped time past the gap and reads a repeated time as its first', () => {
    // London: 01:00 GMT becomes 02:00 BST on 2026-03-29; 02:00 BST becomes 01:00 GMT on 2026-10-25.
    expect(localOf(instantOf('2026-03-29T01:30', 'Europe/London'), 'Europe/London')).toBe(
      '2026-03-29T02:30',
    );
    expect(instantOf('2026-10-25T01:30', 'Europe/London')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('refuses text that is not a date and time, and an unknown zone', () => {
    for (const text of [
      '2026-07-01',
      '2026-07-01 09:00',
      '2026-02-30T09:00',
      '2026-07-01T24:00',
      'tomorrow',
    ]) {
      expect(() => instantOf(text, 'UTC')).toThrow();
    }
    expect(() => instantOf('2026-07-01T09:00', 'Mars/Olympus')).toThrow(/not a time zone/);
  });
});
