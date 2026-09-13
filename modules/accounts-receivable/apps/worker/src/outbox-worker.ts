import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { WorkerConfig } from './config.js';
import { retryDelaySeconds, webhookSignature } from './delivery.js';

interface ClaimedEvent {
  tenant_id: string;
  id: string;
  event_type: string;
  aggregate_id: string;
  correlation_id: string;
  payload: object;
  occurred_at: Date;
  attempt_count: number;
  claim_id: string;
}

export class OutboxWorker {
  private readonly pool: Pool;

  constructor(private readonly config: WorkerConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: 'gigalibs-ar-outbox-worker',
    });
    this.pool.on('error', () => log('error', 'idle-database-client-failed'));
  }

  async verifyAccess(): Promise<void> {
    const result = await this.pool.query<{
      migration_present: boolean;
      permitted: boolean;
      is_superuser: boolean;
      bypasses_rls: boolean;
    }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM gigalibs_ar.schema_migrations
          WHERE version = 2 AND name = '000002_ar_outbox_delivery'
        ) AS migration_present,
        pg_has_role(current_user, 'gigalibs_ar_outbox_worker', 'member') AS permitted,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS bypasses_rls
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    const row = result.rows[0];
    if (!row?.migration_present) throw new Error('AR migration 000002 is not installed.');
    if (!row.permitted) throw new Error('Worker database role lacks the outbox group role.');
    if (row.is_superuser || row.bypasses_rls) {
      throw new Error('Worker database role must not be superuser or BYPASSRLS.');
    }
  }

  async processOne(): Promise<boolean> {
    const event = await this.claimOne();
    if (!event) return false;
    const body = JSON.stringify(event.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    let failureCode: string | undefined;
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/cloudevents+json',
          'user-agent': 'gigalibs-ar-outbox/0.1',
          'x-gigalibs-event-id': event.id,
          'x-gigalibs-event-type': event.event_type,
          'x-gigalibs-tenant-id': event.tenant_id,
          'x-gigalibs-correlation-id': event.correlation_id,
          'x-gigalibs-signature': webhookSignature(this.config.webhookSecret, timestamp, body),
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.httpTimeoutMs),
      });
      if (response.status >= 200 && response.status < 300) {
        await this.markPublished(event);
        log('info', 'event-published', event);
        return true;
      }
      failureCode = `HTTP_${response.status}`;
    } catch (error) {
      failureCode =
        error instanceof DOMException && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK';
    }
    await this.markFailed(event, failureCode);
    log('warn', 'event-delivery-failed', event, { failureCode });
    return true;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async claimOne(): Promise<ClaimedEvent | undefined> {
    const claimId = randomUUID();
    const result = await this.pool.query<ClaimedEvent>(
      `
        WITH candidate AS (
          SELECT tenant_id, id
          FROM gigalibs_ar.outbox_events
          WHERE published_at IS NULL
            AND dead_lettered_at IS NULL
            AND next_attempt_at <= transaction_timestamp()
            AND (
              claim_id IS NULL OR
              claimed_at < transaction_timestamp() - make_interval(secs => $1)
            )
          ORDER BY next_attempt_at, occurred_at, tenant_id, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE gigalibs_ar.outbox_events event
        SET claim_id = $2, claimed_by = $3, claimed_at = transaction_timestamp()
        FROM candidate
        WHERE event.tenant_id = candidate.tenant_id AND event.id = candidate.id
        RETURNING
          event.tenant_id, event.id, event.event_type, event.aggregate_id,
          event.correlation_id, event.payload, event.occurred_at,
          event.attempt_count, event.claim_id
      `,
      [this.config.leaseSeconds, claimId, this.config.workerId],
    );
    return result.rows[0];
  }

  private async markPublished(event: ClaimedEvent): Promise<void> {
    const result = await this.pool.query(
      `
        UPDATE gigalibs_ar.outbox_events
        SET published_at = transaction_timestamp(), claim_id = NULL, claimed_by = NULL,
          claimed_at = NULL, last_error_code = NULL
        WHERE tenant_id = $1 AND id = $2 AND claim_id = $3 AND published_at IS NULL
      `,
      [event.tenant_id, event.id, event.claim_id],
    );
    if (result.rowCount !== 1)
      throw new Error('Outbox claim was lost before publish acknowledgement.');
  }

  private async markFailed(event: ClaimedEvent, failureCode: string): Promise<void> {
    const nextAttempt = event.attempt_count + 1;
    const deadLetter = nextAttempt >= this.config.maxAttempts;
    const delay = retryDelaySeconds(nextAttempt);
    const result = await this.pool.query(
      `
        UPDATE gigalibs_ar.outbox_events
        SET attempt_count = attempt_count + 1,
          next_attempt_at = transaction_timestamp() + make_interval(secs => $4),
          last_error_code = $5,
          dead_lettered_at = CASE WHEN $6 THEN transaction_timestamp() ELSE NULL END,
          claim_id = NULL, claimed_by = NULL, claimed_at = NULL
        WHERE tenant_id = $1 AND id = $2 AND claim_id = $3 AND published_at IS NULL
      `,
      [event.tenant_id, event.id, event.claim_id, delay, failureCode, deadLetter],
    );
    if (result.rowCount !== 1)
      throw new Error('Outbox claim was lost before failure acknowledgement.');
  }
}

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  event?: Pick<ClaimedEvent, 'id' | 'tenant_id' | 'event_type' | 'correlation_id'>,
  fields: Record<string, unknown> = {},
): void {
  const output = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(event
      ? {
          eventId: event.id,
          tenantId: event.tenant_id,
          eventType: event.event_type,
          correlationId: event.correlation_id,
        }
      : {}),
    ...fields,
  });
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.info(output);
}
