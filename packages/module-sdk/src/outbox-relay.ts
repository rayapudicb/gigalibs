import { signRelayToken } from '@gigalibs/auth-core';
import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';
import type { RelayConfig } from './relay-config.js';

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

/** The part of the module database the relay needs: its allow-listed definer functions. */
export interface RelayDatabase<F extends string> {
  relayCall<T extends pg.QueryResultRow>(fn: F, values: readonly unknown[]): Promise<T[]>;
}

export interface OutboxRelayOptions<F extends string> {
  /** Definer function that leases pending facts routed to the peer (at most one per aggregate). */
  readonly leaseFunction: F;
  /** Definer function that settles a leased fact (published, retry or dead letter). */
  readonly settleFunction: F;
  /** Relay token audience of the peer inbox. */
  readonly audience: string;
  /** This module's relay token source. */
  readonly source: string;
  /** Logged at start-up when the relay is not configured. */
  readonly notConfiguredMessage: string;
}

/**
 * Outbox relay to a peer module's inbox (ADR-0007 option A). Leases facts through the definer function, signs one
 * relay token per message, and settles each row: 2xx published; a 4xx other than 408/429 is a permanent failure
 * (dead letter); anything else retries with exponential back-off up to ten attempts. Outbox rows stay authoritative,
 * so resetting a row to PENDING replays it; the consumer inbox deduplicates.
 */
export class OutboxRelay<F extends string = string>
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  protected readonly logger = new Logger(this.constructor.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  constructor(
    private readonly relayDatabase: RelayDatabase<F>,
    private readonly relayConfig: RelayConfig,
    private readonly relayOptions: OutboxRelayOptions<F>,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.relayConfig.outbound) {
      this.logger.log(this.relayOptions.notConfiguredMessage);
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.relayConfig.intervalMs);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** One relay pass; returns how many rows were published. */
  async tick(): Promise<number> {
    const outbound = this.relayConfig.outbound;
    if (!outbound || this.running || this.stopping) return 0;
    this.running = true;
    let published = 0;
    const { leaseFunction, settleFunction, audience, source } = this.relayOptions;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: rows come from the definer function's SETOF outbox row.
      const rows = await this.relayDatabase.relayCall<any>(leaseFunction, [BATCH, LEASE_SECONDS]);
      // The lease takes at most one pending fact per aggregate; order the batch by when facts happened.
      rows.sort(
        (left, right) =>
          Date.parse(left.created_at) - Date.parse(right.created_at) ||
          String(left.id).localeCompare(String(right.id)),
      );
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
        const outcome = await deliver(
          outbound.targetOrigin,
          outbound.privateKey,
          audience,
          source,
          envelope,
        );
        const retrySeconds = outcome.permanent
          ? null
          : Math.min(5 * 2 ** Math.max(Number(row.attempt_count) - 1, 0), 900);
        await this.relayDatabase.relayCall(settleFunction, [
          row.id,
          outcome.ok,
          outcome.code,
          outcome.ok ? 0 : retrySeconds,
          MAX_ATTEMPTS,
        ]);
        if (outcome.ok) published += 1;
        else
          this.logger.warn(
            `Relay of ${row.event_type} ${row.id} failed: ${outcome.code}${outcome.permanent ? ' (dead letter)' : ''}.`,
          );
      }
    } catch (error) {
      this.logger.error(
        'The outbox relay pass failed.',
        error instanceof Error ? error.stack : undefined,
      );
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
  const token = signRelayToken(
    { audience, source, tenantId: envelope.tenantId, messageId: envelope.messageId, body },
    privateKey,
    60,
  );
  try {
    const response = await fetch(new URL('/internal/v1/inbox', targetOrigin), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Correlation-Id': envelope.correlationId,
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) return { ok: true, permanent: false, code: null };
    const permanent =
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429;
    return { ok: false, permanent, code: `HTTP_${response.status}` };
  } catch (error) {
    return {
      ok: false,
      permanent: false,
      code: error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'UNREACHABLE',
    };
  }
}
