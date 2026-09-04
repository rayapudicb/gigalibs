export interface AnalyticsEvent {
  id: string;
  tenantId: string;
  userId?: string;
  eventName: string;
  properties?: Record<string, unknown>;
  timestamp: Date;
}

export interface FunnelStep {
  eventName: string;
  label: string;
}

export interface FunnelStepResult {
  step: string;
  count: number;
  conversionRate: number; // 0 to 100%
  dropoffRate: number;
}
