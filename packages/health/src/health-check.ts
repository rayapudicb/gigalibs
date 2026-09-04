import type { HealthReport, HealthIndicatorFn, HealthStatus } from './types.js';

export class HealthService {
  private indicators = new Map<string, HealthIndicatorFn>();
  private startTime = Date.now();

  register(name: string, indicator: HealthIndicatorFn): void {
    this.indicators.set(name, indicator);
  }

  async check(): Promise<HealthReport> {
    const checks: Record<string, import('./types.js').HealthIndicatorResult> = {};
    let overallStatus: HealthStatus = 'up';

    for (const [name, indicator] of this.indicators.entries()) {
      const result = await indicator();
      checks[name] = result;

      if (result.status === 'down') {
        overallStatus = 'down';
      } else if (result.status === 'degraded' && overallStatus !== 'down') {
        overallStatus = 'degraded';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }
}

export const healthService = new HealthService();
