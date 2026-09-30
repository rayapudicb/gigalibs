import { describe, expect, it } from 'vitest';
import { cadenceToCron, describeCron } from '../lib/schedules/cadence';

// WI-OI-104c: the schedule panel's presets and how a stored cron reads back.
describe('schedule cadence', () => {
  it('turns the presets into cron and reads them back', () => {
    expect(cadenceToCron({ kind: 'daily', time: '06:30' })).toBe('30 6 * * *');
    expect(cadenceToCron({ kind: 'weekly', time: '18:05', weekday: 1 })).toBe('5 18 * * 1');
    expect(cadenceToCron({ kind: 'monthly', time: '00:00', day: 28 })).toBe('0 0 28 * *');
    expect(describeCron('30 6 * * *')).toBe('Every day at 06:30');
    expect(describeCron('5 18 * * 1')).toBe('Every Monday at 18:05');
    expect(describeCron('0 0 1 * *')).toBe('Day 1 of every month at 00:00');
  });

  it('refuses impossible choices and shows other cron as written', () => {
    expect(() => cadenceToCron({ kind: 'daily', time: '24:00' })).toThrow('HH:MM');
    expect(() => cadenceToCron({ kind: 'monthly', time: '06:00', day: 31 })).toThrow('1 to 28');
    expect(() => cadenceToCron({ kind: 'weekly', time: '06:00', weekday: 7 })).toThrow('weekday');
    expect(describeCron('*/15 * * * *')).toBe('*/15 * * * *');
    expect(describeCron('0 6 * * 1-5')).toBe('0 6 * * 1-5');
  });
});
