import { describe, expect, it } from 'vitest';
import { shiftAt } from './logbook.service.js';

// WI-OI-137: an instant belongs to the shift that started most recently at or before it, in the logbook's zone.
const windows = [{ name: 'Day', start: '06:00', end: '18:00' }, { name: 'Night', start: '18:00', end: '06:00' }];

describe('shift of an instant', () => {
  it('places day and overnight instants in their shift and shift date', () => {
    expect(shiftAt(windows, 'UTC', '2026-11-02T10:00:00.000Z')).toEqual({
      shiftDate: '2026-11-02', shiftName: 'Day', startsAt: '2026-11-02T06:00:00.000Z', endsAt: '2026-11-02T18:00:00.000Z',
    });
    expect(shiftAt(windows, 'UTC', '2026-11-03T02:30:00.000Z')).toEqual({
      shiftDate: '2026-11-02', shiftName: 'Night', startsAt: '2026-11-02T18:00:00.000Z', endsAt: '2026-11-03T06:00:00.000Z',
    });
    expect(shiftAt(windows, 'UTC', '2026-11-02T18:00:00.000Z').shiftName).toBe('Night');
  });

  it('reads the windows in the logbook zone across a clock change', () => {
    // Europe/London leaves summer time at 02:00 on 2026-10-25: the night shift is 13 hours long.
    const night = shiftAt(windows, 'Europe/London', '2026-10-25T03:00:00.000Z');
    expect(night).toEqual({ shiftDate: '2026-10-24', shiftName: 'Night', startsAt: '2026-10-24T17:00:00.000Z', endsAt: '2026-10-25T06:00:00.000Z' });
    expect(shiftAt(windows, 'Asia/Kolkata', '2026-11-02T01:00:00.000Z')).toMatchObject({ shiftDate: '2026-11-02', shiftName: 'Day' });
  });

  it('assigns a gap between windows to the shift that last started', () => {
    expect(shiftAt([{ name: 'Day', start: '08:00', end: '16:00' }], 'UTC', '2026-11-02T20:00:00.000Z'))
      .toMatchObject({ shiftDate: '2026-11-02', shiftName: 'Day' });
    expect(shiftAt([{ name: 'Day', start: '08:00', end: '16:00' }], 'UTC', '2026-11-02T05:00:00.000Z'))
      .toMatchObject({ shiftDate: '2026-11-01', shiftName: 'Day' });
  });
});
