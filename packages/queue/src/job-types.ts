// ─── Well-known queue names ───────────────────────────────────────────────────

export const Queues = {
  EMAIL:           'gigalibs:queue:email',
  SMS:             'gigalibs:queue:sms',
  PUSH:            'gigalibs:queue:push',
  WEBHOOK_DELIVER: 'gigalibs:queue:webhook-deliver',
  AUDIT_WRITE:     'gigalibs:queue:audit-write',
  IMPORT_PROCESS:  'gigalibs:queue:import-process',
  EXPORT_GENERATE: 'gigalibs:queue:export-generate',
  INVOICE_GENERATE:'gigalibs:queue:invoice-generate',
  THUMBNAIL:       'gigalibs:queue:thumbnail',
  WORKFLOW_RUN:    'gigalibs:queue:workflow-run',
  SCHEDULED:       'gigalibs:queue:scheduled',
} as const;

export type QueueName = typeof Queues[keyof typeof Queues];

// ─── Job Data Types ───────────────────────────────────────────────────────────

export interface EmailJob {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}

export interface SmsJob {
  to: string;
  body: string;
  from?: string;
  tenantId: string;
}

export interface WebhookDeliverJob {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  endpoint: string;
  secret: string;
  attempt: number;
}

export interface AuditWriteJob {
  action: string;
  resource: string;
  resourceId?: string;
  userId?: string;
  tenantId?: string;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ImportProcessJob {
  importId: string;
  tenantId: string;
  userId: string;
  fileKey: string;
  resource: string;
  columnMapping: Record<string, string>;
}
