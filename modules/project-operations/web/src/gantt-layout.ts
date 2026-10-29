/** Map ISO dates to horizontal bar offsets for a read-only Gantt (WI-OI-129 S5). */
export function ganttBarStyle(
  plannedStart: string | null,
  plannedEnd: string | null,
  rangeStartMs: number,
  rangeEndMs: number,
): { leftPercent: number; widthPercent: number } | null {
  if (!plannedStart || !plannedEnd) return null;
  const start = Date.parse(plannedStart);
  const end = Date.parse(plannedEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || rangeEndMs <= rangeStartMs) {
    return null;
  }
  const span = rangeEndMs - rangeStartMs;
  const left = ((Math.max(start, rangeStartMs) - rangeStartMs) / span) * 100;
  const width = ((Math.min(end, rangeEndMs) - Math.max(start, rangeStartMs)) / span) * 100;
  return { leftPercent: Math.min(Math.max(left, 0), 100), widthPercent: Math.min(Math.max(width, 2), 100) };
}

export function projectTimelineRange(
  plannedStart: string | null,
  plannedEnd: string | null,
  taskStarts: Array<string | null>,
  taskEnds: Array<string | null>,
): { startMs: number; endMs: number } {
  const stamps = [plannedStart, plannedEnd, ...taskStarts, ...taskEnds]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (stamps.length === 0) {
    const now = Date.now();
    return { startMs: now, endMs: now + 7 * 86400000 };
  }
  const startMs = Math.min(...stamps);
  const endMs = Math.max(...stamps);
  return startMs === endMs ? { startMs, endMs: endMs + 86400000 } : { startMs, endMs };
}
