// ─── Broker Abstractions ──────────────────────────────────────────────────────

export type EventPayload = Record<string, unknown>;

export interface BrokerMessage<T extends EventPayload = EventPayload> {
  id: string;
  event: string;
  payload: T;
  tenantId?: string;
  timestamp: string;
}

export type EventHandler<T extends EventPayload = EventPayload> = (
  message: BrokerMessage<T>,
) => void | Promise<void>;

/**
 * Broker adapter interface — implement this to add new broker backends.
 * Redis, RabbitMQ, Kafka all implement this same interface.
 */
export interface BrokerAdapter {
  publish<T extends EventPayload>(event: string, payload: T, tenantId?: string): Promise<void>;
  subscribe<T extends EventPayload>(event: string, handler: EventHandler<T>): Promise<() => void>;
  unsubscribeAll(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

// ─── Well-known platform events ───────────────────────────────────────────────
// Use these constants instead of string literals to prevent typos.

export const Events = {
  // Auth
  USER_REGISTERED:    'auth.user.registered',
  USER_LOGGED_IN:     'auth.user.logged_in',
  USER_LOGGED_OUT:    'auth.user.logged_out',

  // Tenancy
  TENANT_CREATED:     'tenancy.tenant.created',
  TENANT_SUSPENDED:   'tenancy.tenant.suspended',
  MEMBER_INVITED:     'tenancy.member.invited',
  MEMBER_JOINED:      'tenancy.member.joined',
  MEMBER_REMOVED:     'tenancy.member.removed',

  // Billing
  SUBSCRIPTION_STARTED:   'billing.subscription.started',
  SUBSCRIPTION_CANCELLED: 'billing.subscription.cancelled',
  INVOICE_PAID:           'billing.invoice.paid',
  PAYMENT_FAILED:         'billing.payment.failed',

  // Notifications
  NOTIFICATION_SEND: 'notifications.send',

  // Workflow
  WORKFLOW_TRIGGERED: 'workflow.triggered',
  WORKFLOW_COMPLETED: 'workflow.completed',
} as const;

export type EventName = typeof Events[keyof typeof Events];
