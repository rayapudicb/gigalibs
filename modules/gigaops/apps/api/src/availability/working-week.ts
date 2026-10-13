import { WEEKDAYS, type WeekdayV1, type WeeklySlotV1 } from '@gigalibs/contracts';
import { BadRequestException } from '@nestjs/common';

// WI-OI-120u (M-WF1 Slice 2): a working week as one line of text in a metadata window, for example
// "Mon-Fri 09:00-17:00; Sat 10:00-14:00". Days are listed with commas or as a range; an end before the start runs
// past midnight. The domain still checks the slots (no overlap, a start before the end).

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const ENTRY = /^(.+?)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/;

const invalid = (message: string) =>
  new BadRequestException({
    code: 'WORKFORCE_VALIDATION_FAILED',
    message: `${message} Write the week as, for example, "Mon-Fri 09:00-17:00; Sat 10:00-14:00".`,
  });

function dayIndex(word: string): number {
  const index = SHORT.findIndex(
    (day) => day.toLowerCase() === word.trim().slice(0, 3).toLowerCase(),
  );
  if (index < 0 || word.trim().length < 3) throw invalid(`"${word.trim()}" is not a day.`);
  return index;
}

const time = (text: string) => (text.length === 4 ? `0${text}` : text);

/** The slots of a week written as text. */
export function parseWeek(text: string): WeeklySlotV1[] {
  const entries = text
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) throw invalid('Give the working hours.');
  return entries.flatMap((entry) => {
    const match = ENTRY.exec(entry);
    if (!match) throw invalid(`"${entry}" is not days and hours.`);
    const [, days, start, end] = match as unknown as [string, string, string, string];
    const indexes = days.split(',').flatMap((item) => {
      const [from, to, ...rest] = item.split(/[-–]/);
      if (rest.length > 0 || from === undefined)
        throw invalid(`"${item.trim()}" is not a day or a range of days.`);
      const first = dayIndex(from);
      const last = to === undefined ? first : dayIndex(to);
      if (last < first)
        throw invalid(`"${item.trim()}" runs backwards; write the days Monday to Sunday.`);
      return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
    });
    return indexes.map((index) => ({
      day: WEEKDAYS[index] as WeekdayV1,
      start: time(start),
      end: time(end),
    }));
  });
}

/** A week's slots as text, with days of the same hours run together: "Mon-Fri 09:00-17:00; Sat 10:00-14:00". */
export function formatWeek(slots: readonly WeeklySlotV1[]): string {
  const groups = new Map<string, number[]>();
  for (const slot of slots) {
    const hours = `${slot.start}-${slot.end}`;
    groups.set(hours, [...(groups.get(hours) ?? []), WEEKDAYS.indexOf(slot.day)]);
  }
  return [...groups.entries()]
    .map(([hours, days]) => {
      const sorted = [...new Set(days)].sort((a, b) => a - b);
      const runs: [number, number][] = [];
      for (const day of sorted) {
        const last = runs.at(-1);
        if (last && day === last[1] + 1) last[1] = day;
        else runs.push([day, day]);
      }
      return {
        first: sorted[0] ?? 0,
        text: `${runs.map(([a, b]) => (a === b ? SHORT[a] : `${SHORT[a]}-${SHORT[b]}`)).join(',')} ${hours}`,
      };
    })
    .sort((left, right) => left.first - right.first)
    .map((group) => group.text)
    .join('; ');
}
