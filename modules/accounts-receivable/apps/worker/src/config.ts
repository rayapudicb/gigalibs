import { z } from 'zod';

const schema = z.object({
  AR_WORKER_DATABASE_URL: z
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  AR_EVENT_WEBHOOK_URL: z.url(),
  AR_EVENT_WEBHOOK_SECRET: z.string().min(32).max(1000),
  AR_WORKER_ID: z.string().min(1).max(200),
  AR_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  AR_WORKER_HTTP_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(5000),
  AR_WORKER_LEASE_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  AR_WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(20),
  AR_WORKER_ALLOW_INSECURE_HTTP: z.enum(['true', 'false']).default('false'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export interface WorkerConfig {
  databaseUrl: string;
  webhookUrl: string;
  webhookSecret: string;
  workerId: string;
  pollIntervalMs: number;
  httpTimeoutMs: number;
  leaseSeconds: number;
  maxAttempts: number;
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = schema.parse(environment);
  const webhook = new URL(parsed.AR_EVENT_WEBHOOK_URL);
  const allowHttp = parsed.AR_WORKER_ALLOW_INSECURE_HTTP === 'true';
  if (parsed.NODE_ENV === 'production' && allowHttp) {
    throw new Error('AR_WORKER_ALLOW_INSECURE_HTTP cannot be enabled in production.');
  }
  if (webhook.protocol !== 'https:' && !allowHttp) {
    throw new Error('AR_EVENT_WEBHOOK_URL must use HTTPS.');
  }
  if (webhook.username || webhook.password || webhook.hash) {
    throw new Error('AR_EVENT_WEBHOOK_URL must not contain credentials or a fragment.');
  }
  return {
    databaseUrl: parsed.AR_WORKER_DATABASE_URL,
    webhookUrl: webhook.toString(),
    webhookSecret: parsed.AR_EVENT_WEBHOOK_SECRET,
    workerId: parsed.AR_WORKER_ID,
    pollIntervalMs: parsed.AR_WORKER_POLL_INTERVAL_MS,
    httpTimeoutMs: parsed.AR_WORKER_HTTP_TIMEOUT_MS,
    leaseSeconds: parsed.AR_WORKER_LEASE_SECONDS,
    maxAttempts: parsed.AR_WORKER_MAX_ATTEMPTS,
  };
}
