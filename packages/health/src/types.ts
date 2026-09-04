export type HealthStatus = 'up' | 'down' | 'degraded';

export interface HealthIndicatorResult {
  status: HealthStatus;
  details?: Record<string, unknown>;
  error?: string;
}

export type HealthIndicatorFn = () => Promise<HealthIndicatorResult>;

export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  checks: Record<string, HealthIndicatorResult>;
}
