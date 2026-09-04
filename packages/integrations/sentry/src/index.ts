/**
 * @gigalibs/integration-sentry
 *
 * Sentry real-time exception tracking and performance APM instrumentation.
 *
 * @module
 */

export interface SentryConfig {
  dsn: string;
  environment?: string;
  tracesSampleRate?: number;
}

export class SentryAdapter {
  constructor(private readonly config: SentryConfig) {}

  captureException(err: Error, context?: Record<string, unknown>): string {
    const eventId = `sentry_event_${Date.now()}`;
    // In production, delegate to Sentry.captureException()
    return eventId;
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): string {
    return `sentry_msg_${Date.now()}`;
  }
}
