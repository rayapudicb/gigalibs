import { describe,expect,it } from 'vitest';
import { roundOccurrence,occurrenceRequestKey } from './schedule.js';

const schedule={cadence:'DAILY',timeZone:'Asia/Kolkata',localTime:'08:00',
  graceMinutes:30,windowMinutes:60};

describe('Rounds schedule occurrence',() => {
  it('resolves a route wall clock in its configured zone',() => {
    expect(roundOccurrence(schedule,'2026-10-30')).toEqual({
      scheduledStart:'2026-10-30T02:30:00.000Z',dueAt:'2026-10-30T03:30:00.000Z'});
  });
  it('generates only selected ISO weekdays',() => {
    const weekly={...schedule,cadence:'WEEKLY',weekdays:[1,3]};
    expect(roundOccurrence(weekly,'2026-10-30')).toBeNull();
    expect(roundOccurrence(weekly,'2026-11-02')).not.toBeNull();
  });
  it('refuses per-shift generation until Workforce supplies shift windows',() => {
    expect(() => roundOccurrence({...schedule,cadence:'PER_SHIFT',localTime:undefined},'2026-10-30'))
      .toThrow(/Workforce shift windows/);
  });
  it('refuses a skipped DST wall time and chooses the earlier repeated occurrence',() => {
    const ny={...schedule,timeZone:'America/New_York',localTime:'02:30'};
    expect(() => roundOccurrence(ny,'2026-03-08')).toThrow(/does not exist/);
    expect(roundOccurrence({...ny,localTime:'01:30'},'2026-11-01')?.scheduledStart)
      .toBe('2026-11-01T05:30:00.000Z');
  });
  it('keeps a stable UUID request key across generation retries',() => {
    const key=occurrenceRequestKey('route-a','worker-a','2026-10-30');
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(occurrenceRequestKey('route-a','worker-a','2026-10-30')).toBe(key);
    expect(occurrenceRequestKey('route-a','worker-b','2026-10-30')).not.toBe(key);
  });
});
