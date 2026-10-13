import { BadRequestException } from '@nestjs/common';

// WI-OI-120u (M-WF1 Slice 2): metadata windows show and take times as local wall-clock text (`YYYY-MM-DDTHH:mm`, what a
// datetime-local input holds), with no zone. Workforce reads them in the person's working time zone (their working
// pattern's IANA zone; UTC without one) and stores instants, as the domain always has.

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const formats = new Map<string, Intl.DateTimeFormat>();

function wallClock(epoch: number, zone: string): number {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formats.set(zone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(epoch)).map((part) => [part.type, part.value]),
  );
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

/** How far `zone` is ahead of UTC at an instant, in milliseconds. */
const offsetAt = (epoch: number, zone: string) => wallClock(epoch, zone) - epoch;

function knownZone(zone: string): string {
  try {
    wallClock(0, zone);
    return zone;
  } catch {
    throw new BadRequestException({
      code: 'WORKFORCE_VALIDATION_FAILED',
      message: `${zone} is not a time zone.`,
    });
  }
}

/**
 * The instant (ISO, UTC) of a local wall-clock time in `zone`. A time the clocks skip (spring forward) moves on by
 * the gap; a time that happens twice (fall back) is the first of the two.
 */
export function instantOf(local: string, zone: string): string {
  const match = LOCAL.exec(local);
  if (!match)
    throw new BadRequestException({
      code: 'WORKFORCE_VALIDATION_FAILED',
      message: 'Give a date and time (YYYY-MM-DD HH:MM).',
    });
  const [, year, month, day, hour, minute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(asUtc).getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new BadRequestException({
      code: 'WORKFORCE_VALIDATION_FAILED',
      message: `${local} is not a date and time.`,
    });
  }
  knownZone(zone);
  const before = offsetAt(asUtc - 86_400_000, zone);
  const after = offsetAt(asUtc + 86_400_000, zone);
  // Try the offset in force a day either side; the earlier instant that shows this wall-clock time wins.
  const candidates = [asUtc - Math.max(before, after), asUtc - Math.min(before, after)];
  const exact = candidates.find((epoch) => wallClock(epoch, zone) === asUtc);
  // No instant shows it (the clocks skipped it): read it with the offset before the change, which lands after the gap.
  return new Date(exact ?? asUtc - before).toISOString();
}

/** An instant as local wall-clock text (`YYYY-MM-DDTHH:mm`) in `zone`. */
export function localOf(instant: string, zone: string): string {
  const epoch = Date.parse(instant);
  if (Number.isNaN(epoch)) return instant;
  return new Date(wallClock(epoch, knownZone(zone))).toISOString().slice(0, 16);
}
