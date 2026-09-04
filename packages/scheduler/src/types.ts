export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string; // e.g. '0 0 * * *'
  handlerName: string;
  payload?: Record<string, unknown>;
  isActive: boolean;
  lastRunAt?: Date | null;
  nextRunAt?: Date | null;
}
