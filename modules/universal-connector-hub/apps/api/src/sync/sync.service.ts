import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  BadGatewayException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import {
  assertAllowedConnectorUrl,
  loadConnectorHubRuntimeConfig,
} from '../runtime-config.js';

export interface SyncOptions {
  batch_size?: number;
  cursor_override?: string;
  source_records?: Array<{
    id: string;
    version?: string | number;
    event_type?: string;
    data: Record<string, any>;
  }>;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly db: DatabaseService) {}

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
   * CN-03: Real delta sync with bounded fetching, durable checkpointing, and source-to-journal reconciliation.
   */
  async triggerSync(tenantId: string, connectionId: string, options?: SyncOptions): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const connRes = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_connectors.tenant_connections WHERE (id = $1 OR slug = $1) AND tenant_id = $2`,
      [connectionId, tenantId],
    );

    if (connRes.rowCount === 0) {
      throw new NotFoundException(`Connection '${connectionId}' not found for tenant '${tenantId}'`);
    }

    const conn = connRes.rows[0];
    const jobId = `job-${randomUUID().slice(0, 8)}`;
    const startTime = performance.now();

    // 1. Retrieve last committed checkpoint watermark
    const lastJobRes = await this.db.queryWithTenant(
      tenantId,
      `SELECT cursor_after FROM gigalibs_connectors.sync_jobs
       WHERE tenant_id = $1 AND connection_id = $2 AND status = 'COMPLETED'
       ORDER BY completed_at DESC LIMIT 1`,
      [tenantId, conn.id],
    );

    const currentCursor =
      options?.cursor_override ||
      lastJobRes.rows[0]?.cursor_after ||
      new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const batchLimit = Math.min(options?.batch_size || 50, 100);
    let recordsToProcess: Array<{
      id: string;
      version?: string | number;
      event_type?: string;
      data: Record<string, any>;
    }> = [];

    // 2. Fetch records: either from provided batch, external provider REST API, or delta stream
    if (options?.source_records && options.source_records.length > 0) {
      recordsToProcess = options.source_records.slice(0, batchLimit);
    } else {
      const config = conn.configuration || {};
      const syncEndpoint = config.sync_endpoint || config.instance_url;

      if (syncEndpoint) {
        try {
          const fetchUrl = assertAllowedConnectorUrl(
            syncEndpoint,
            loadConnectorHubRuntimeConfig(),
          );
          fetchUrl.searchParams.set('since', currentCursor);
          fetchUrl.searchParams.set('limit', String(batchLimit));

          const res = await fetch(fetchUrl.toString(), {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'x-tenant-id': tenantId,
            },
            signal: AbortSignal.timeout(8000),
          });

          if (!res.ok) throw new Error(`Remote sync returned HTTP ${res.status}.`);
          const data: any = await res.json();
          const rawList = Array.isArray(data) ? data : data.records || data.items || [];
          recordsToProcess = rawList.map((item: any, idx: number) => ({
            id: item.id || item.source_id || `rec-${idx}`,
            version: item.version || item.updated_at || 1,
            event_type: `${conn.connector_code.toLowerCase()}.record_synced`,
            data: item,
          }));
        } catch (fetchErr: any) {
          this.logger.warn(`Remote sync fetch failed: ${fetchErr.message}`);
          throw new BadGatewayException('The configured connector source could not be synchronized.');
        }
      } else {
        throw new BadRequestException(
          'No source records or configured sync endpoint were provided.',
        );
      }
    }

    // 3. Ingest records atomically into raw_ingestion_journal
    let ingestedCount = 0;
    let duplicateCount = 0;
    let nextCursor = currentCursor;

    for (const rec of recordsToProcess) {
      const payloadStr = JSON.stringify(rec.data);
      const payloadSha256 = createHash('sha256').update(payloadStr).digest('hex');
      const idempotencyKey = `sync-${conn.slug}-${rec.id}-v${rec.version ?? 1}`;
      const eventType = rec.event_type || `${conn.connector_code.toLowerCase()}.sync_item`;
      const ingestId = `ing-sync-${randomUUID().slice(0, 8)}`;

      // Check if already in journal
      const dupCheck = await this.db.queryWithTenant(
        tenantId,
        `SELECT id FROM gigalibs_connectors.raw_ingestion_journal
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey],
      );

      if (dupCheck.rowCount && dupCheck.rowCount > 0) {
        duplicateCount++;
        continue;
      }

      await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_connectors.raw_ingestion_journal (
          id, tenant_id, connection_id, idempotency_key, event_type, payload_sha256,
          raw_payload, headers, client_ip, status, duration_ms, received_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '127.0.0.1', 'INGESTED', 0, NOW())`,
        [
          ingestId,
          tenantId,
          conn.id,
          idempotencyKey,
          eventType,
          payloadSha256,
          payloadStr,
          JSON.stringify({ sync_job_id: jobId, source_id: rec.id }),
        ],
      );

      ingestedCount++;
      nextCursor = new Date().toISOString();
    }

    const durationMs = Math.max(1, Math.round(performance.now() - startTime));

    // 4. Commit durable checkpoint
    await this.db.queryWithTenant(
      tenantId,
      `INSERT INTO gigalibs_connectors.sync_jobs (
        id, tenant_id, connection_id, job_type, status, records_ingested,
        cursor_after, duration_ms, started_at, completed_at
      ) VALUES ($1, $2, $3, 'MANUAL', 'COMPLETED', $4, $5, $6, NOW(), NOW())`,
      [jobId, tenantId, conn.id, ingestedCount, nextCursor, durationMs],
    );

    // 5. Update connection statistics
    if (ingestedCount > 0) {
      await this.db.queryWithTenant(
        tenantId,
        `UPDATE gigalibs_connectors.tenant_connections 
         SET events_count = events_count + $1, last_sync_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [ingestedCount, conn.id, tenantId],
      );
    }

    return {
      success: true,
      job_id: jobId,
      connection_id: conn.id,
      connection_name: conn.name,
      records_synced: ingestedCount,
      duplicates_skipped: duplicateCount,
      cursor_before: currentCursor,
      cursor_after: nextCursor,
      duration_ms: durationMs,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    };
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
