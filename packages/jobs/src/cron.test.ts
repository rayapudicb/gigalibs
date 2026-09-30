import { describe, expect, it } from 'vitest';
import { CronExpressionError, nextCronRun, parseCron } from './cron.js';

const next = (expression: string, after: string, zone = 'UTC') => nextCronRun(parseCron(expression), new Date(after), zone).toISOString();

// WI-OI-104c: recurring schedules use five-field cron in the schedule's time zone.
describe('cron', () => {
  it('finds the next minute, hour, day and month in UTC', () => {
    expect(next('*/15 * * * *', '2026-09-30T10:07:30Z')).toBe('2026-09-30T10:15:00.000Z');
    expect(next('0 2 * * *', '2026-09-30T02:00:00Z')).toBe('2026-10-01T02:00:00.000Z');
    expect(next('30 6 1 * *', '2026-09-30T10:00:00Z')).toBe('2026-10-01T06:30:00.000Z');
    expect(next('0 0 29 FEB *', '2026-03-01T00:00:00Z')).toBe('2028-02-29T00:00:00.000Z');
    expect(next('0 9 * * MON-FRI', '2026-10-02T09:00:00Z')).toBe('2026-10-05T09:00:00.000Z');
    expect(next('0 9 * * 7', '2026-09-30T00:00:00Z')).toBe('2026-10-04T09:00:00.000Z');
  });

  it('runs on either the day of month or the day of week when both are restricted', () => {
    // The 15th, or any Monday: after Wed 30 Sep the next is Mon 5 Oct.
    expect(next('0 8 15 * MON', '2026-09-30T12:00:00Z')).toBe('2026-10-05T08:00:00.000Z');
  });

  it('evaluates in the schedule time zone', () => {
    // 02:00 in Kolkata (UTC+05:30) is 20:30 UTC the day before.
    expect(next('0 2 * * *', '2026-09-30T00:00:00Z', 'Asia/Kolkata')).toBe('2026-09-30T20:30:00.000Z');
    // New York: 09:00 EDT (UTC-4) before the change, 09:00 EST (UTC-5) after 1 Nov 2026.
    expect(next('0 9 * * *', '2026-10-31T14:00:00Z', 'America/New_York')).toBe('2026-11-01T14:00:00.000Z');
  });

  it('skips a local time that a daylight-saving change removes', () => {
    // 02:30 does not exist in New York on 8 Mar 2026; the next 02:30 is 9 Mar.
    expect(next('30 2 * * *', '2026-03-08T00:00:00Z', 'America/New_York')).toBe('2026-03-09T06:30:00.000Z');
  });

  it('refuses malformed expressions and unknown zones', () => {
    for (const bad of ['* * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '*/0 * * * *', '5-1 * * * *', 'x * * * *']) {
      expect(() => parseCron(bad)).toThrow(CronExpressionError);
    }
    expect(() => nextCronRun(parseCron('* * * * *'), new Date(), 'Mars/Olympus')).toThrow(CronExpressionError);
    expect(() => nextCronRun(parseCron('0 0 31 2 *'), new Date('2026-01-01T00:00:00Z'))).toThrow('never runs');
  });
});
