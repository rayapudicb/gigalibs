import type { MetricsService } from './metrics.service.js';

interface RequestShape {
  method: string;
  route?: { path?: unknown };
}

interface ResponseShape {
  statusCode: number;
  once(event: 'finish', listener: () => void): void;
}

export function createHttpMetricsMiddleware(metrics: MetricsService) {
  return (request: RequestShape, response: ResponseShape, next: () => void): void => {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
      metrics.recordHttpRequest({
        method: request.method,
        route: typeof request.route?.path === 'string' ? request.route.path : undefined,
        statusCode: response.statusCode,
        durationSeconds: Number(elapsedNanoseconds) / 1_000_000_000,
      });
    });
    next();
  };
}
