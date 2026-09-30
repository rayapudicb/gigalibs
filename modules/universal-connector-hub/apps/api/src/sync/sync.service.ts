import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { VaultCryptoService } from '../connectors/vault-crypto.service.js';
import { loadConnectorHubRuntimeConfig } from '../runtime-config.js';
import { PullConfigError, parsePullSource } from '../pull/pull-source.js';
import { PullRunner, SyncInProgressError } from '../pull/pull-runner.js';
import { TokenCache } from '../pull/source-auth.js';
import { SourceError } from '../pull/source-http.js';

export interface SyncOptions {
  /** Ignore the watermark and read the source from the start (records already journalled are skipped). */
  from_start?: boolean;
}

/** HTTP 424: the source or its login needs fixing; retrying will not help. */
const FAILED_DEPENDENCY = 424;

@Injectable()
export class SyncService {
  private readonly tokens = new TokenCache();
  private readonly runner: PullRunner;

  constructor(
    private readonly db: DatabaseService,
    private readonly vault: VaultCryptoService,
  ) {
    const config = loadConnectorHubRuntimeConfig();
    this.runner = new PullRunner(db, {
      allowedOutboundHosts: config.allowedOutboundHosts,
      allowInsecureOutbound: config.allowInsecureOutbound,
      tokens: this.tokens,
      decryptCredentials: (tenantId, connectionId) => this.decryptCredentials(tenantId, connectionId),
    });
  }

  async getJournal(tenantId: string, limit: number = 50): Promise<any[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const res = await this.db.queryWithTenant(
      tenantId,
      `SELECT 
        j.id, j.tenant_id, j.connection_id, j.idempotency_key, j.event_type,
        j.payload_sha256, j.raw_payload, j.client_ip, j.status, j.dispatched_run_id,
        j.duration_ms, j.received_at,
        c.name AS connection_name, c.slug, c.connector_code
       FROM gigalibs_connectors.raw_ingestion_journal j
       JOIN gigalibs_connectors.tenant_connections c ON j.connection_id = c.id
       WHERE j.tenant_id = $1
       ORDER BY j.received_at DESC
       LIMIT $2`,
      [tenantId, Math.min(Math.max(1, limit), 200)],
    );
    return res.rows;
  }

  /**
   * WI-OI-104d: pull the connection's configured source once (see PullRunner). Answers 409 while another pull of the
   * same connection runs, 502 when the source is unavailable (worth retrying), and 424 when the source or its login
   * needs fixing.
   */
  async triggerSync(tenantId: string, connectionId: string, options: SyncOptions = {}, correlationId?: string | null): Promise<Record<string, unknown>> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const connection = await this.db.queryWithTenant<{ id: string; name: string; connector_code: string; configuration: Record<string, unknown> | null; deliver_to_analytics: boolean }>(
      tenantId,
      `SELECT id, name, connector_code, configuration, deliver_to_analytics FROM gigalibs_connectors.tenant_connections
        WHERE (id = $1 OR slug = $1) AND tenant_id = $2`,
      [connectionId, tenantId],
    );
    const conn = connection.rows[0];
    if (!conn) throw new NotFoundException(`Connection '${connectionId}' not found.`);
    if (!conn.configuration?.source) throw new BadRequestException('This connection has no pull source; configure one first.');
    let source;
    try {
      source = parsePullSource(conn.configuration.source);
    } catch (error) {
      throw new BadRequestException(`The pull source is not valid: ${(error as Error).message}`);
    }
    try {
      const result = await this.runner.run(
        { id: conn.id, tenantId, connectorCode: conn.connector_code, name: conn.name, deliverToAnalytics: conn.deliver_to_analytics },
        source,
        { fromStart: options.from_start === true, correlationId: correlationId ?? null },
      );
      return {
        success: true,
        job_id: result.jobId,
        connection_id: conn.id,
        connection_name: conn.name,
        status: result.status,
        records_synced: result.recordsIngested,
        duplicates_skipped: result.duplicatesSkipped,
        records_quarantined: result.recordsQuarantined,
        pages: result.pages,
        truncated: result.truncated,
        cursor_before: result.watermarkBefore,
        cursor_after: result.watermarkAfter,
        duration_ms: result.durationMs,
      };
    } catch (error) {
      if (error instanceof SyncInProgressError) throw new ConflictException(error.message);
      if (error instanceof PullConfigError) throw new BadRequestException(error.message);
      if (error instanceof SourceError) {
        if (error.kind === 'unavailable') throw new BadGatewayException(error.message);
        throw new HttpException({ statusCode: FAILED_DEPENDENCY, message: error.message }, FAILED_DEPENDENCY);
      }
      throw error;
    }
  }

  async listSyncJobs(tenantId: string, connectionId: string): Promise<unknown[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT j.id, j.job_type, j.status, j.records_ingested, j.duplicates_skipped, j.records_quarantined,
              j.pages_fetched, j.truncated, j.watermark_before, j.cursor_after, j.error_details, j.duration_ms,
              j.correlation_id, j.started_at, j.completed_at
         FROM gigalibs_connectors.sync_jobs j
         JOIN gigalibs_connectors.tenant_connections c ON c.id = j.connection_id
        WHERE j.tenant_id = $1 AND (c.id = $2 OR c.slug = $2)
        ORDER BY j.started_at DESC LIMIT 20`,
      [tenantId, connectionId],
    );
    return result.rows;
  }

  async listQuarantine(tenantId: string, connectionId: string): Promise<unknown[]> {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT q.id, q.sync_job_id, q.source_id, q.reason, q.raw_payload, q.received_at
         FROM gigalibs_connectors.quarantined_records q
         JOIN gigalibs_connectors.tenant_connections c ON c.id = q.connection_id
        WHERE q.tenant_id = $1 AND (c.id = $2 OR c.slug = $2)
        ORDER BY q.received_at DESC LIMIT 100`,
      [tenantId, connectionId],
    );
    return result.rows;
  }

  private async decryptCredentials(tenantId: string, connectionId: string): Promise<unknown | null> {
    const result = await this.db.queryWithTenant<{ encrypted_data: string; iv: string | null; auth_tag: string | null }>(
      tenantId,
      `SELECT encrypted_data, iv, auth_tag FROM gigalibs_connectors.connector_credentials
        WHERE tenant_id = $1 AND connection_id = $2 ORDER BY updated_at DESC LIMIT 1`,
      [tenantId, connectionId],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (!row.iv || !row.auth_tag) throw new SourceError('refused', 'The stored credentials are incomplete; store them again.');
    const plain = this.vault.decrypt({ encryptedData: row.encrypted_data, iv: row.iv, authTag: row.auth_tag });
    try {
      return JSON.parse(plain);
    } catch {
      return null;
    }
  }

  async getStats(tenantId: string): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const connStats = await this.db.queryWithTenant(
      tenantId,
      `SELECT 
        COUNT(*)::int AS total_connections,
        COUNT(CASE WHEN status = 'READY' THEN 1 END)::int AS ready_connections,
        COALESCE(SUM(events_count), 0)::int AS total_events_processed
       FROM gigalibs_connectors.tenant_connections
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const journalStats = await this.db.queryWithTenant(
      tenantId,
      `SELECT 
        COUNT(*)::int AS journal_count,
        COALESCE(AVG(duration_ms), 0)::int AS avg_latency_ms,
        COUNT(CASE WHEN status = 'DISPATCHED' THEN 1 END)::int AS dispatched_count
       FROM gigalibs_connectors.raw_ingestion_journal
       WHERE tenant_id = $1`,
      [tenantId],
    );

    return {
      total_connections: connStats.rows[0]?.total_connections || 0,
      ready_connections: connStats.rows[0]?.ready_connections || 0,
      total_events_processed: connStats.rows[0]?.total_events_processed || 0,
      journal_entries: journalStats.rows[0]?.journal_count || 0,
      dispatched_to_workflows: journalStats.rows[0]?.dispatched_count || 0,
      avg_latency_ms: journalStats.rows[0]?.avg_latency_ms || 0,
    };
  }
}
