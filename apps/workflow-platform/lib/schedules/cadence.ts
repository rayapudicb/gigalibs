/**
 * WI-OI-104c: the everyday cadences a member picks from, as five-field cron in the schedule's time zone, and back to
 * words. A cron the presets cannot express is shown as written.
 */

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export type Cadence =
  | { readonly kind: 'daily'; readonly time: string }
  | { readonly kind: 'weekly'; readonly time: string; readonly weekday: number }
  | { readonly kind: 'monthly'; readonly time: string; readonly day: number };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function cadenceToCron(cadence: Cadence): string {
  const match = TIME.exec(cadence.time);
  if (!match) throw new Error('Choose a time as HH:MM.');
  const clock = `${Number(match[2])} ${Number(match[1])}`;
  if (cadence.kind === 'daily') return `${clock} * * *`;
  if (cadence.kind === 'weekly') {
    if (!Number.isInteger(cadence.weekday) || cadence.weekday < 0 || cadence.weekday > 6) throw new Error('Choose a weekday.');
    return `${clock} * * ${cadence.weekday}`;
  }
  // Days 29–31 do not exist in every month, so a monthly run is limited to days 1–28.
  if (!Number.isInteger(cadence.day) || cadence.day < 1 || cadence.day > 28) throw new Error('Choose a day from 1 to 28.');
  return `${clock} ${cadence.day} * *`;
}

export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  const [minute, hour, day, month, weekday] = parts;
  const simple = (value: string | undefined, max: number) => value !== undefined && /^\d+$/.test(value) && Number(value) <= max;
  if (parts.length !== 5 || !simple(minute, 59) || !simple(hour, 23) || month !== '*') return cron;
  const time = `${hour!.padStart(2, '0')}:${minute!.padStart(2, '0')}`;
  if (day === '*' && weekday === '*') return `Every day at ${time}`;
  if (day === '*' && simple(weekday, 6)) return `Every ${WEEKDAYS[Number(weekday)]} at ${time}`;
  if (simple(day, 31) && weekday === '*') return `Day ${Number(day)} of every month at ${time}`;
  return cron;
}
