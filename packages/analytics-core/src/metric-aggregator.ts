import type { AnalyticsEvent } from './types.js';

export class MetricAggregator {
  static countEvents(events: AnalyticsEvent[], eventName?: string): number {
    if (!eventName) return events.length;
    return events.filter((e) => e.eventName === eventName).length;
  }

  static getUniqueUsers(events: AnalyticsEvent[]): number {
    const users = new Set<string>();
    events.forEach((e) => {
      if (e.userId) users.add(e.userId);
    });
    return users.size;
  }
}
