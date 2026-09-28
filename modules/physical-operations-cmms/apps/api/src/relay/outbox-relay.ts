import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { signRelayToken } from '@gigalibs/auth-core';
import { DatabaseService } from '../database/database.service.js';
import { WORKFORCE_INBOX_AUDIENCE, CMMS_RELAY_CONFIG, type CmmsRelayConfig } from './relay-config.js';

const BATCH = 20;
const LEASE_SECONDS = 60;
const MAX_ATTEMPTS = 10;

/** The Delta 5 envelope delivered to a consumer inbox. */
export interface RelayEnvelope {
  readonly messageId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly schemaVersion: number;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: string;
}

/**
 * Outbox relay to the Workforce inbox (ADR-0007 option A). Leases handshake rows through the definer function,
 * signs one relay token per message, and settles each row: 2xx published; a 4xx other than 408/429 is a
 * permanent failure (dead letter); anything else retries with exponential back-off up to ten attempts.
 * Outbox rows stay authoritative, so resetting a row to PENDING replays it; the consumer inbox deduplicates.
 */
@Injectable()
export class CmmsOutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CmmsOutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  constructor(
    private readonly database: DatabaseService,
    @Inject(CMMS_RELAY_CONFIG) private readonly config: CmmsRelayConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.outbound) {
      this.logger.log('Outbox relay to Workforce is not configured; staffing facts stay in the outbox.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** One relay pass; returns how many rows were published. */
  async tick(): Promise<number> {
    const outbound = this.config.outbound;
    if (!outbound || this.running || this.stopping) return 0;
    this.running = true;
    let published = 0;
    try {
      const rows = await this.database.relayCall<any>('relay_lease_workforce_events', [BATCH, LEASE_SECONDS]);
      // The lease takes at most one pending fact per work order; order the batch by when facts happened.
      rows.sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at) || String(left.id).localeCompare(String(right.id)));
      for (const row of rows) {
        const envelope: RelayEnvelope = {
          messageId: row.id,
          tenantId: row.tenant_id,
          eventType: row.event_type,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          aggregateVersion: Number(row.aggregate_version),
          correlationId: row.correlation_id,
          causationId: row.causation_id ?? null,
          schemaVersion: Number(row.schema_version),
          payload: row.payload,
          occurredAt: new Date(row.created_at).toISOString(),
        };
        const outcome = await deliver(outbound.targetOrigin, outbound.privateKey, WORKFORCE_INBOX_AUDIENCE, 'cmms', envelope);
        const retrySeconds = outcome.permanent ? null : Math.min(5 * 2 ** Math.max(Number(row.attempt_count) - 1, 0), 900);
        await this.database.relayCall('relay_settle_workforce_event', [row.id, outcome.ok, outcome.code, outcome.ok ? 0 : retrySeconds, MAX_ATTEMPTS]);
        if (outcome.ok) published += 1;
        else this.logger.warn(`Relay of ${row.event_type} ${row.id} failed: ${outcome.code}${outcome.permanent ? ' (dead letter)' : ''}.`);
      }
    } catch (error) {
      this.logger.error('The outbox relay pass failed.', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
    return published;
  }
}

export async function deliver(
  targetOrigin: string,
  privateKey: string,
  audience: string,
  source: string,
  envelope: RelayEnvelope,
): Promise<{ readonly ok: boolean; readonly permanent: boolean; readonly code: string | null }> {
  const body = JSON.stringify(envelope);
  const token = signRelayToken({ audience, source, tenantId: envelope.tenantId, messageId: envelope.messageId, body }, privateKey, 60);
  try {
    const response = await fetch(new URL('/internal/v1/inbox', targetOrigin), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Correlation-Id': envelope.correlationId },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return { ok: true, permanent: false, code: null };
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    return { ok: false, permanent, code: `HTTP_${response.status}` };
  } catch (error) {
    return { ok: false, permanent: false, code: error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'UNREACHABLE' };
  }
}
