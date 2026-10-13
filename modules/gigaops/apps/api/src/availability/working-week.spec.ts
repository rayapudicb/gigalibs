import { describe, expect, it } from 'vitest';
import { formatWeek, parseWeek } from './working-week.js';

// WI-OI-120u (M-WF1 Slice 2): a working week written and shown as one line in a metadata window.
describe('working week as text', () => {
  it('reads ranges, lists and several entries', () => {
    expect(parseWeek('Mon-Fri 09:00-17:00; Sat 10:00-14:00')).toEqual([
      ...['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((day) => ({
        day,
        start: '09:00',
        end: '17:00',
      })),
      { day: 'SATURDAY', start: '10:00', end: '14:00' },
    ]);
    expect(parseWeek('mon,wed,FRIDAY 8:30 - 12:00')).toEqual([
      { day: 'MONDAY', start: '08:30', end: '12:00' },
      { day: 'WEDNESDAY', start: '08:30', end: '12:00' },
      { day: 'FRIDAY', start: '08:30', end: '12:00' },
    ]);
    // A night shift runs past midnight; the domain reads an earlier end as the next day.
    expect(parseWeek('Sun 22:00-06:00')).toEqual([{ day: 'SUNDAY', start: '22:00', end: '06:00' }]);
  });

  it('writes a week back as the same text, days of the same hours run together', () => {
    for (const text of [
      'Mon-Fri 09:00-17:00; Sat 10:00-14:00',
      'Mon,Wed,Fri 08:30-12:00',
      'Mon-Tue,Thu-Sun 07:00-15:00',
      'Sun 22:00-06:00',
    ]) {
      expect(formatWeek(parseWeek(text))).toBe(text);
    }
    expect(formatWeek([])).toBe('');
  });

  it('refuses what is not days and hours, with an example', () => {
    for (const text of [
      '',
      'Mon-Fri',
      'Funday 09:00-17:00',
      'Fri-Mon 09:00-17:00',
      'Mon 9-5',
      'Mon-Tue-Wed 09:00-17:00',
    ]) {
      expect(() => parseWeek(text)).toThrow(/Mon-Fri 09:00-17:00/);
    }
  });
});
