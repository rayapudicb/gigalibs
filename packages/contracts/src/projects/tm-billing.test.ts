import { describe, expect, it } from 'vitest';
import { buildMilestoneInvoiceDraftLine, buildTmInvoiceDraftLines } from './tm-billing.js';

describe('buildTmInvoiceDraftLines', () => {
  it('sorts by work date and computes line totals from hours × rate', () => {
    const lines = buildTmInvoiceDraftLines([
      {
        timesheetId: 'b0000000-0000-4000-a000-000000000002',
        taskId: 'c0000000-0000-4000-a000-000000000001',
        taskName: 'Install',
        workerSubject: 'tech-1',
        workDate: '2026-10-02',
        hours: '2.000000',
        hourlyRateMinor: '5000',
      },
      {
        timesheetId: 'a0000000-0000-4000-a000-000000000001',
        taskId: 'c0000000-0000-4000-a000-000000000001',
        taskName: 'Install',
        workerSubject: 'tech-1',
        workDate: '2026-10-01',
        hours: '1.500000',
        hourlyRateMinor: '4000',
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.timesheetId).toBe('a0000000-0000-4000-a000-000000000001');
    expect(lines[0]?.lineTotalMinor).toBe('6000');
    expect(lines[1]?.lineTotalMinor).toBe('10000');
  });
});

describe('buildMilestoneInvoiceDraftLine', () => {
  it('returns the milestone amount as a single line', () => {
    const line = buildMilestoneInvoiceDraftLine({
      projectLineId: 'd0000000-0000-4000-a000-000000000001',
      description: 'Phase 1 complete',
      amountMinor: '250000',
    });
    expect(line.amountMinor).toBe('250000');
  });
});
