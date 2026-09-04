import type { HealthIndicatorResult } from '../types.js';

export function createDbIndicator(checkFn: () => Promise<unknown>) {
  return async (): Promise<HealthIndicatorResult> => {
    try {
      const start = Date.now();
      await checkFn();
      const latencyMs = Date.now() - start;
      return {
        status: 'up',
        details: { latencyMs },
      };
    } catch (err: unknown) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : 'Database check failed',
      };
    }
  };
}

export function createRedisIndicator(pingFn: () => Promise<string | boolean>) {
  return async (): Promise<HealthIndicatorResult> => {
    try {
      const start = Date.now();
      const res = await pingFn();
      const latencyMs = Date.now() - start;
      return {
        status: res ? 'up' : 'down',
        details: { latencyMs },
      };
    } catch (err: unknown) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : 'Redis ping failed',
      };
    }
  };
}

export function createMemoryIndicator(maxHeapBytes?: number) {
  return async (): Promise<HealthIndicatorResult> => {
    const memory = process.memoryUsage();
    const isExceeded = maxHeapBytes ? memory.heapUsed > maxHeapBytes : false;
    return {
      status: isExceeded ? 'degraded' : 'up',
      details: {
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
        rssMb: Math.round(memory.rss / 1024 / 1024),
      },
      ...(isExceeded ? { error: 'Memory threshold exceeded' } : {}),
    };
  };
}
