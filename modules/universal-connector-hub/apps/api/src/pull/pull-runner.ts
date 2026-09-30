/**
 * WI-OI-104d: one pull of one connection.
 *  1. Take the connection's sync lease (one pull at a time; an abandoned lease expires).
 *  2. Record a RUNNING sync job, starting from the last completed job's watermark.
 *  3. Page through the source. Each page's records are written in one transaction: good records to the journal
 *     (idempotent on source id plus payload hash, so a re-read or retry never duplicates), unidentifiable ones to
 *     quarantine with a reason.
 *  4. Complete the job. The watermark comes from the records themselves: it moves to the newest one seen when the run
 *     read everything, or to the last one when a truncated run's records came oldest first. Otherwise it stays, and the
 *     next run re-reads (duplicates are skipped).
 *  A failure marks the job FAILED and the connection ERROR, keeps what was written, and leaves the watermark alone.
 *  WI-OI-104e: when the connection sends to Analytics, each newly journalled record also writes an outbox fact in the
 *  same transaction, so a record is delivered exactly when it is journalled.
 */

import { createHash, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type pg from 'pg';
import { type PagingOutcome, inspectRecord, pullPages } from './pager.js';
import { type PullCredentials, type PullSource, parsePullCredentials } from './pull-source.js';
import { SourceLogin, type TokenCache } from './source-auth.js';
import { SourceError, SourceHttp } from './source-http.js';

export interface PullDatabase {
  queryWithTenant<T extends pg.QueryResultRow = pg.QueryResultRow>(tenantId: string, text: string, params?: unknown[]): Promise<pg.QueryResult<T>>;
  withTenantTransaction<T>(tenantId: string, operation: (client: pg.PoolClient) => Promise<T>): Promise<T>;
}

export interface PullConnection {
  readonly id: string;
  readonly tenantId: string;
  readonly connectorCode: string;
  readonly name?: string;
  /** WI-OI-104e: newly journalled records also become outbox facts for the Analytics relay. */
  readonly deliverToAnalytics?: boolean;
}

export interface PullOptions {
  readonly fromStart?: boolean;
  readonly correlationId?: string | null;
}

export interface PullResult {
  readonly jobId: string;
  readonly status: 'COMPLETED';
  readonly recordsIngested: number;
  readonly duplicatesSkipped: number;
  readonly recordsQuarantined: number;
  readonly pages: number;
  readonly truncated: boolean;
  readonly watermarkBefore: string | null;
  readonly watermarkAfter: string | null;
  readonly durationMs: number;
}

export class SyncInProgressError extends Error {}

export interface PullRunnerOptions {
  readonly allowedOutboundHosts: ReadonlySet<string>;
  readonly allowInsecureOutbound: boolean;
  readonly decryptCredentials: (tenantId: string, connectionId: string) => Promise<unknown | null>;
  readonly tokens: TokenCache;
  readonly budgetMs?: number;
  readonly leaseSeconds?: number;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class PullRunner {
  private readonly logger = new Logger('PullRunner');

  constructor(
    private readonly db: PullDatabase,
    private readonly options: PullRunnerOptions,
  ) {}

  async run(connection: PullConnection, source: PullSource, options: PullOptions = {}): Promise<PullResult> {
    const { tenantId, id: connectionId } = connection;
    const started = Date.now();
    const lease = await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_connectors.tenant_connections
          SET sync_lease_expires_at = now() + make_interval(secs => $3), status = 'SYNCING', updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND (sync_lease_expires_at IS NULL OR sync_lease_expires_at < now())
        RETURNING id`,
      [connectionId, tenantId, this.options.leaseSeconds ?? 300],
    );
    if (lease.rowCount === 0) throw new SyncInProgressError('A sync of this connection is already running.');

    const jobId = `sync-${randomUUID()}`;
    let watermarkBefore: string | null = null;
    try {
      if (!options.fromStart) {
        const last = await this.db.queryWithTenant<{ cursor_after: string | null }>(
          tenantId,
          `SELECT cursor_after FROM gigalibs_connectors.sync_jobs
            WHERE tenant_id = $1 AND connection_id = $2 AND status = 'COMPLETED' AND cursor_after IS NOT NULL
            ORDER BY completed_at DESC LIMIT 1`,
          [tenantId, connectionId],
        );
        const candidate = last.rows[0]?.cursor_after ?? null;
        watermarkBefore = candidate && !Number.isNaN(Date.parse(candidate)) ? new Date(candidate).toISOString() : null;
      }
      await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_connectors.sync_jobs
           (id, tenant_id, connection_id, job_type, status, watermark_before, correlation_id, started_at)
         VALUES ($1, $2, $3, $4, 'RUNNING', $5, $6, now())`,
        [jobId, tenantId, connectionId, options.correlationId?.startsWith('schedule:') ? 'SCHEDULED' : 'MANUAL', watermarkBefore, options.correlationId?.slice(0, 128) ?? null],
      );
    } catch (error) {
      await this.release(connection, 'ERROR');
      throw error;
    }

    const counts = { ingested: 0, duplicates: 0, quarantined: 0 };
    const outcome: PagingOutcome = { pages: 0, truncated: false };
    let newest: Date | null = null;
    let last: Date | null = null;
    let ascending = true;
    try {
      const credentials = await this.credentials(connection, source);
      const http = new SourceHttp({
        allowedOutboundHosts: this.options.allowedOutboundHosts,
        allowInsecureOutbound: this.options.allowInsecureOutbound,
        deadline: started + (this.options.budgetMs ?? 90_000),
        ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
        ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
      });
      const login = new SourceLogin(source.auth, credentials, http, this.options.tokens, `${tenantId}:${connectionId}`);
      const since = watermarkBefore ? new Date(watermarkBefore) : null;
      for await (const page of pullPages(source, http, login, since, outcome)) {
        await this.db.withTenantTransaction(tenantId, async (client) => {
          for (const raw of page) {
            const record = inspectRecord(raw, source);
            if (!record.ok) {
              await client.query(
                `INSERT INTO gigalibs_connectors.quarantined_records
                   (tenant_id, connection_id, sync_job_id, source_id, reason, raw_payload)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
                [tenantId, connectionId, jobId, record.sourceId, record.reason, record.json],
              );
              counts.quarantined += 1;
              continue;
            }
            const key = `pull:${connectionId}:${createHash('sha256').update(record.sourceId).digest('hex').slice(0, 16)}:${record.payloadSha256.slice(0, 32)}`;
            const inserted = await client.query(
              `INSERT INTO gigalibs_connectors.raw_ingestion_journal
                 (id, tenant_id, connection_id, idempotency_key, event_type, payload_sha256, raw_payload, headers, client_ip, status, received_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, 'source-pull', 'INGESTED', now())
               ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
              [
                `ing-${randomUUID()}`,
                tenantId,
                connectionId,
                key,
                `${connection.connectorCode.toLowerCase()}.pulled`,
                record.payloadSha256,
                record.json,
                JSON.stringify({ sync_job_id: jobId, source_id: record.sourceId }),
              ],
            );
            if ((inserted.rowCount ?? 0) > 0) {
              counts.ingested += 1;
              if (connection.deliverToAnalytics) await this.emit(client, connection, jobId, record, options.correlationId ?? null);
            } else {
              counts.duplicates += 1;
            }
            if (record.watermark) {
              if (last && record.watermark < last) ascending = false;
              last = record.watermark;
              if (!newest || record.watermark > newest) newest = record.watermark;
            }
          }
        });
      }
    } catch (error) {
      await this.fail(connection, jobId, counts, outcome, started, error);
      throw error;
    }

    const watermarkAfter = nextWatermark(watermarkBefore, newest, last, outcome.truncated, ascending);
    const durationMs = Math.max(1, Date.now() - started);
    await this.db.queryWithTenant(
      tenantId,
      `UPDATE gigalibs_connectors.sync_jobs
          SET status = 'COMPLETED', records_ingested = $2, duplicates_skipped = $3, records_quarantined = $4,
              pages_fetched = $5, truncated = $6, cursor_after = $7, duration_ms = $8, completed_at = now()
        WHERE id = $1`,
      [jobId, counts.ingested, counts.duplicates, counts.quarantined, outcome.pages, outcome.truncated, watermarkAfter, durationMs],
    );
    await this.release(connection, 'READY', counts.ingested);
    return {
      jobId,
      status: 'COMPLETED',
      recordsIngested: counts.ingested,
      duplicatesSkipped: counts.duplicates,
      recordsQuarantined: counts.quarantined,
      pages: outcome.pages,
      truncated: outcome.truncated,
      watermarkBefore,
      watermarkAfter,
      durationMs,
    };
  }

  /** One CONNECTOR_RECORD_PULLED_V1 fact per new record version; the aggregate is the source record. */
  private async emit(
    client: pg.PoolClient,
    connection: PullConnection,
    jobId: string,
    record: { sourceId: string; payloadSha256: string; json: string },
    correlationId: string | null,
  ): Promise<void> {
    const aggregateId = `${connection.id}:${createHash('sha256').update(record.sourceId).digest('hex').slice(0, 32)}`;
    await client.query(
      `INSERT INTO gigalibs_connectors.outbox_events
         (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload)
       VALUES ($1, $2::varchar, 'connector.records', 'CONNECTOR_RECORD_PULLED_V1', 'connector_record', $3::varchar,
               (SELECT count(*) + 1 FROM gigalibs_connectors.outbox_events
                 WHERE tenant_id = $2::varchar AND aggregate_type = 'connector_record' AND aggregate_id = $3::varchar),
               $4, 1, $5::jsonb)`,
      [
        `evt-${randomUUID()}`,
        connection.tenantId,
        aggregateId,
        (correlationId ?? jobId).slice(0, 128),
        JSON.stringify({
          hubConnectionId: connection.id,
          connectionName: connection.name ?? connection.id,
          connectorCode: connection.connectorCode,
          syncJobId: jobId,
          sourceId: record.sourceId,
          payloadSha256: record.payloadSha256,
          record: JSON.parse(record.json) as unknown,
        }),
      ],
    );
  }

  private async credentials(connection: PullConnection, source: PullSource): Promise<PullCredentials | null> {
    if (source.auth.kind === 'none') return null;
    const stored = await this.options.decryptCredentials(connection.tenantId, connection.id);
    if (!stored) throw new SourceError('refused', `This source logs in with ${source.auth.kind}; store its credentials first.`);
    try {
      return parsePullCredentials(stored);
    } catch {
      throw new SourceError('refused', 'The stored credentials are not in the form this source needs; store them again.');
    }
  }

  private async fail(connection: PullConnection, jobId: string, counts: { ingested: number; duplicates: number; quarantined: number }, outcome: PagingOutcome, started: number, error: unknown): Promise<void> {
    const detail =
      error instanceof SourceError
        ? { kind: error.kind, status: error.status ?? null, message: error.message.slice(0, 500) }
        : { kind: 'internal', status: null, message: 'The pull stopped on an internal error.' };
    await this.db.queryWithTenant(
      connection.tenantId,
      `UPDATE gigalibs_connectors.sync_jobs
          SET status = 'FAILED', records_ingested = $2, duplicates_skipped = $3, records_quarantined = $4,
              pages_fetched = $5, error_details = $6::jsonb, duration_ms = $7, completed_at = now()
        WHERE id = $1`,
      [jobId, counts.ingested, counts.duplicates, counts.quarantined, outcome.pages, JSON.stringify(detail), Math.max(1, Date.now() - started)],
    ).catch((failure: Error) => this.logger.warn(`Could not record the failed sync ${jobId}: ${failure.message}`));
    // The lease also expires on its own, so a failed release delays the next pull at most by the lease time.
    await this.release(connection, 'ERROR', counts.ingested).catch((failure: Error) => this.logger.warn(`Could not release the sync lease of ${connection.id}: ${failure.message}`));
  }

  private async release(connection: PullConnection, status: 'READY' | 'ERROR', ingested = 0): Promise<void> {
    await this.db.queryWithTenant(
      connection.tenantId,
      `UPDATE gigalibs_connectors.tenant_connections
          SET sync_lease_expires_at = NULL, status = $3::varchar, events_count = events_count + $4::int,
              last_sync_at = CASE WHEN $3::varchar = 'READY' THEN now() ELSE last_sync_at END, updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [connection.id, connection.tenantId, status, ingested],
    );
  }
}

export function nextWatermark(before: string | null, newest: Date | null, last: Date | null, truncated: boolean, ascending: boolean): string | null {
  const previous = before ? new Date(before) : null;
  const candidate = !truncated ? newest : ascending ? last : null;
  if (!candidate) return before;
  return !previous || candidate > previous ? candidate.toISOString() : before;
}
