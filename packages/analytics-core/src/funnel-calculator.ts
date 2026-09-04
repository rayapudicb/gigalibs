import type { AnalyticsEvent, FunnelStep, FunnelStepResult } from './types.js';

export class FunnelCalculator {
  /**
   * Calculates multi-step conversion funnels.
   */
  static calculate(events: AnalyticsEvent[], steps: FunnelStep[]): FunnelStepResult[] {
    if (steps.length === 0) return [];

    const counts: number[] = steps.map(() => 0);

    for (const event of events) {
      steps.forEach((step, idx) => {
        if (event.eventName === step.eventName) {
          counts[idx] = (counts[idx] ?? 0) + 1;
        }
      });
    }

    const firstStepCount = counts[0] || 1;

    return steps.map((step, idx) => {
      const count = counts[idx] ?? 0;
      const prevCount = idx === 0 ? count : counts[idx - 1] || 1;
      const conversionRate = Math.round((count / firstStepCount) * 100);
      const dropoffRate = Math.max(0, 100 - Math.round((count / prevCount) * 100));

      return {
        step: step.label,
        count,
        conversionRate,
        dropoffRate,
      };
    });
  }
}
