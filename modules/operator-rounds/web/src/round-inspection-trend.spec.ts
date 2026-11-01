import { describe,expect,it } from 'vitest';
import { trendPoints } from './round-inspection-trend';

const day=(date:string,average:string) => ({day:date,unitCode:'bar',average,
  minimum:average,maximum:average,sampleCount:1,lastAcceptedAt:`${date}T08:00:00.000Z`});

describe('inspection trend plot',() => {
  it('keeps flat and negative series finite and inside the chart',() => {
    expect(trendPoints([day('2026-10-01','-10'),day('2026-10-02','-10')]))
      .toBe('10.00,70.00 430.00,70.00');
    expect(trendPoints([day('2026-10-01','-10'),day('2026-10-02','10')]))
      .toBe('10.00,130.00 430.00,10.00');
  });

  it('refuses a non-finite number rather than drawing a misleading curve',() => {
    expect(trendPoints([day('2026-10-01','1e999')])).toBe('');
  });
});
