import { describe, expect, it } from 'vitest';
import { DAY_ONE_TASKS, type DayOneTask, summarizeDayOneBenchmark } from './index.js';

// WI-OI-120 (X2): the Day-1 onboarding task benchmark — a measurement, not a gate.
describe('summarizeDayOneBenchmark', () => {
  it('measures the current Day-1 task set', () => {
    const b = summarizeDayOneBenchmark(DAY_ONE_TASKS, 200);
    expect(b.totalTasks).toBe(8);
    expect(b.manualOnly).toBe(1); // only naming the company is manual-only today
    expect(b.automatable).toBe(7);
    expect(b.automationCoverage).toBe(88);
    expect(b.byMode).toEqual({ ASSISTANT: 0, BULK_API: 3, API: 4, MANUAL_UI: 1 });
  });

  it('shows the bulk advantage: 200 people take one call per bulk task, not one call each', () => {
    const b = summarizeDayOneBenchmark(DAY_ONE_TASKS, 200);
    // invite + grant + off-board are the per-person tasks; each does 200 in a single call.
    expect(b.peopleImportCalls).toBe(3);
    expect(b.peopleImportCallsIfOneByOne).toBe(600);
  });

  it('coverage is 0 when every task is manual, 100 when none is', () => {
    const allManual: DayOneTask[] = [{ key: 'a', label: 'a', mode: 'MANUAL_UI', surface: 'x' }];
    const allAuto: DayOneTask[] = [{ key: 'b', label: 'b', mode: 'API', surface: 'y' }];
    expect(summarizeDayOneBenchmark(allManual).automationCoverage).toBe(0);
    expect(summarizeDayOneBenchmark(allAuto).automationCoverage).toBe(100);
    expect(summarizeDayOneBenchmark([]).automationCoverage).toBe(0);
  });
});
