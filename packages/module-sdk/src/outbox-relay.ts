import { signRelayToken } from '@gigalibs/auth-core';
import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';
import type { RelayConfig } from './relay-config.js';
import { registerRelayHealth } from './relay-health.js';

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
  // WI-OI-120as: what `GET v1/health/relays` reports for this relay.
  private readonly startedAt = Date.now();
  private lastPassAt: string | null = null;
  private lastPassLeased = 0;
  private lastDeliveredAt: string | null = null;
  private deliveredSinceStart = 0;
  private lastFailureAt: string | null = null;
  private lastFailureCode: string | null = null;
  private passStartedAt: number | null = null;
  private lastProgressAt: number | null = null;
  private consecutiveFailedPasses = 0;

  constructor(
    private readonly relayDatabase: RelayDatabase<F>,
    private readonly relayConfig: RelayConfig,
    private readonly relayOptions: OutboxRelayOptions<F>,
  ) {}

  onApplicationBootstrap(): void {
    registerRelayHealth(`${this.relayOptions.source} -> ${this.relayOptions.audience}`, () => ({
      relay: `${this.relayOptions.source} -> ${this.relayOptions.audience}`,
      configured: Boolean(this.relayConfig.outbound),
      intervalMs: this.relayConfig.outbound ? this.relayConfig.intervalMs : null,
      startedAt: this.startedAt,
      lastPassAt: this.lastPassAt,
      lastPassLeased: this.lastPassLeased,
      lastDeliveredAt: this.lastDeliveredAt,
      deliveredSinceStart: this.deliveredSinceStart,
      lastFailureAt: this.lastFailureAt,
      lastFailureCode: this.lastFailureCode,
      passStartedAt: this.passStartedAt,
      lastProgressAt: this.lastProgressAt,
      consecutiveFailedPasses: this.consecutiveFailedPasses,
    }));
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
    this.passStartedAt = Date.now();
    this.lastProgressAt = null;
    let published = 0;
    let leased = 0;
    const { leaseFunction, settleFunction, audience, source } = this.relayOptions;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: rows come from the definer function's SETOF outbox row.
      const rows = await this.relayDatabase.relayCall<any>(leaseFunction, [BATCH, LEASE_SECONDS]);
      this.lastPassLeased = rows.length;
      leased = rows.length;
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
        this.lastProgressAt = Date.now();
        if (outcome.ok) {
          published += 1;
          this.deliveredSinceStart += 1;
          this.lastDeliveredAt = new Date().toISOString();
        } else {
          this.lastFailureAt = new Date().toISOString();
          this.lastFailureCode = outcome.code;
          this.logger.warn(
            `Relay of ${row.event_type} ${row.id} failed: ${outcome.code}${outcome.permanent ? ' (dead letter)' : ''}.`,
          );
        }
      }
      // A pass counts as done only when it ran to the end, whether or not anything was routed.
      this.lastPassAt = new Date().toISOString();
      // WI-OI-120bd: a delivery resets the failing count; a pass that leased facts and delivered none adds to it; an
      // idle pass leaves it alone (failed facts wait for their retry time, so idle passes come between them).
      if (published > 0) this.consecutiveFailedPasses = 0;
      else if (leased > 0) this.consecutiveFailedPasses += 1;
    } catch (error) {
      this.consecutiveFailedPasses += 1;
      this.lastFailureAt = new Date().toISOString();
      this.lastFailureCode = 'RELAY_PASS_FAILED';
      this.logger.error(
        'The outbox relay pass failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
      this.passStartedAt = null;
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
