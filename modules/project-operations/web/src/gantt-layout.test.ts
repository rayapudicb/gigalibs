import { describe, expect, it } from 'vitest';
import { ganttBarStyle, projectTimelineRange } from './gantt-layout.js';

describe('gantt layout helpers', () => {
  it('computes bar width inside the project range', () => {
    const range = projectTimelineRange('2026-10-01', '2026-10-10', ['2026-10-02'], ['2026-10-04']);
    const bar = ganttBarStyle('2026-10-02', '2026-10-04', range.startMs, range.endMs);
    expect(bar).not.toBeNull();
    expect(bar!.widthPercent).toBeGreaterThan(0);
  });
});
