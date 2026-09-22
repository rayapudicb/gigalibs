/**
 * LineageService — Data Lineage + Tamper-Evident Audit Log
 *
 * Records every governed pipeline event as both:
 *   1. A lineage edge (source → target DAG)
 *   2. An audit log entry (event_type, actor, entity, payload)
 *
 * Both tables are APPEND-ONLY (REVOKE UPDATE/DELETE at migration layer).
 *
 * Rules:
 *  - Lineage claims are never made unconditionally. Each edge is stamped
 *    with the actor and timestamp from the active PlatformContextV1 token.
 *  - Audit events capture only non-sensitive context. No credential bytes,
 *    no PII, no raw secrets ever enter event_payload.
 *  - Errors during lineage recording are logged but never surfaced to
 *    callers — a lineage write failure must not block the main pipeline.
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AnalyticsPrincipal } from '../auth/authorization.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LineageNodeType =
  | 'SOURCE_CONNECTION'
  | 'SYNC_RUN'
  | 'RAW_RECORD_BATCH'
  | 'SCHEMA_DISCOVERY'
  | 'STUDIO_MAPPING'
  | 'DATASET_VERSION'
  | 'SEMANTIC_MODEL'
  | 'CHART_DEFINITION'
  | 'REPORT_RUN'
  | 'REPORT_ARTIFACT';

export type AuditEventType =
  | 'CONNECTION_CREATED' | 'CONNECTION_TESTED' | 'CONNECTION_DELETED'
  | 'SYNC_STARTED' | 'SYNC_COMPLETED' | 'SYNC_FAILED'
  | 'SCHEMA_DISCOVERED' | 'MAPPING_CREATED' | 'MAPPING_PUBLISHED'
  | 'DATASET_BUILD_STARTED' | 'DATASET_BUILD_COMPLETED' | 'DATASET_BUILD_FAILED'
  | 'SEMANTIC_MODEL_CREATED' | 'SEMANTIC_MODEL_VERSION_SAVED'
  | 'CHART_CREATED' | 'CHART_RENDERED' | 'DASHBOARD_CREATED' | 'DASHBOARD_CHART_ADDED'
  | 'REPORT_DEFINITION_CREATED' | 'REPORT_RUN_TRIGGERED'
  | 'REPORT_SUCCEEDED' | 'REPORT_FAILED' | 'REPORT_DOWNLOADED'
  | 'QUERY_EXECUTED';

export interface RecordEdgeDto {
  sourceNodeId: string;
  sourceNodeType: LineageNodeType;
  targetNodeId: string;
  targetNodeType: LineageNodeType;
  edgeLabel?: string;
  edgeMetadata?: Record<string, unknown>;
}

export interface RecordAuditEventDto {
  eventType: AuditEventType;
  entityId?: string;
  entityType?: LineageNodeType;
  /** Must not contain credential bytes, PII, or raw secrets */
  eventPayload?: Record<string, unknown>;
  clientIp?: string;
  correlationId?: string;
}

export interface LineageEdge {
  id: string;
  sourceNodeId: string;
  sourceNodeType: string;
  targetNodeId: string;
  targetNodeType: string;
  edgeLabel: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface AuditEntry {
  id: string;
  eventType: string;
  actorSubject: string;
  entityId: string | null;
  entityType: string | null;
  eventPayload: Record<string, unknown>;
  occurredAt: string;
}

// ─── LineageService ───────────────────────────────────────────────────────────

@Injectable()
export class LineageService {
  private readonly logger = new Logger(LineageService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Record a lineage edge.
   * Fire-and-forget semantics: errors are logged but never re-thrown.
   * Duplicate edges (same source→target in same tenant) are silently ignored
   * via ON CONFLICT DO NOTHING.
   */
  async recordEdge(
    principal: AnalyticsPrincipal,
    dto: RecordEdgeDto,
  ): Promise<void> {
    const { tenantId, subject } = principal;
    try {
      await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_analytics.analytics_lineage_edges
           (tenant_id, source_node_id, source_node_type, target_node_id, target_node_type,
            edge_label, edge_metadata, recorded_by)
         VALUES ($1, $2, $3::gigalibs_analytics.lineage_node_type,
                 $4, $5::gigalibs_analytics.lineage_node_type, $6, $7, $8)
         ON CONFLICT (tenant_id, source_node_id, target_node_id, source_node_type, target_node_type)
           DO NOTHING`,
        [
          tenantId, dto.sourceNodeId, dto.sourceNodeType,
          dto.targetNodeId, dto.targetNodeType,
          dto.edgeLabel ?? null, JSON.stringify(dto.edgeMetadata ?? {}), subject,
        ],
      );
    } catch (err) {
      // Lineage write failure must never block the main pipeline
      this.logger.error(
        `[tenant:${tenantId}] Failed to record lineage edge ${dto.sourceNodeType}→${dto.targetNodeType}: ${err}`,
      );
    }
  }

  /**
   * Record an audit event.
   * Fire-and-forget semantics: errors are logged but never re-thrown.
   * CRITICAL: eventPayload must not contain credential bytes, PII, or raw secrets.
   */
  async recordAuditEvent(
    principal: AnalyticsPrincipal,
    dto: RecordAuditEventDto,
  ): Promise<void> {
    const { tenantId, subject } = principal;
    try {
      await this.db.queryWithTenant(
        tenantId,
        `INSERT INTO gigalibs_analytics.analytics_audit_log
           (tenant_id, event_type, actor_subject, entity_id, entity_type,
            event_payload, client_ip, correlation_id)
         VALUES ($1, $2::gigalibs_analytics.audit_event_type, $3, $4,
                 $5::gigalibs_analytics.lineage_node_type, $6, $7::inet, $8)`,
        [
          tenantId, dto.eventType, subject,
          dto.entityId ?? null,
          dto.entityType ?? null,
          JSON.stringify(dto.eventPayload ?? {}),
          dto.clientIp ?? null,
          dto.correlationId ?? null,
        ],
      );
    } catch (err) {
      this.logger.error(
        `[tenant:${tenantId}] Failed to record audit event ${dto.eventType}: ${err}`,
      );
    }
  }

  // ── Query operations ─────────────────────────────────────────────────────

  async getLineageForNode(
    principal: AnalyticsPrincipal,
    nodeId: string,
    nodeType: LineageNodeType,
    direction: 'upstream' | 'downstream' | 'both' = 'both',
  ): Promise<LineageEdge[]> {
    const { tenantId } = principal;

    let sql: string;
    let params: unknown[];

    if (direction === 'upstream') {
      sql = `SELECT id, source_node_id, source_node_type::text, target_node_id, target_node_type::text,
                    edge_label, recorded_by, recorded_at::text
             FROM gigalibs_analytics.analytics_lineage_edges
             WHERE tenant_id = $1 AND target_node_id = $2 AND target_node_type = $3::gigalibs_analytics.lineage_node_type
             ORDER BY recorded_at ASC`;
      params = [tenantId, nodeId, nodeType];
    } else if (direction === 'downstream') {
      sql = `SELECT id, source_node_id, source_node_type::text, target_node_id, target_node_type::text,
                    edge_label, recorded_by, recorded_at::text
             FROM gigalibs_analytics.analytics_lineage_edges
             WHERE tenant_id = $1 AND source_node_id = $2 AND source_node_type = $3::gigalibs_analytics.lineage_node_type
             ORDER BY recorded_at ASC`;
      params = [tenantId, nodeId, nodeType];
    } else {
      sql = `SELECT id, source_node_id, source_node_type::text, target_node_id, target_node_type::text,
                    edge_label, recorded_by, recorded_at::text
             FROM gigalibs_analytics.analytics_lineage_edges
             WHERE tenant_id = $1
               AND (
                 (source_node_id = $2 AND source_node_type = $3::gigalibs_analytics.lineage_node_type) OR
                 (target_node_id = $2 AND target_node_type = $3::gigalibs_analytics.lineage_node_type)
               )
             ORDER BY recorded_at ASC`;
      params = [tenantId, nodeId, nodeType];
    }

    const result = await this.db.queryWithTenant<any>(tenantId, sql, params);
    return result.rows.map((r: any) => this.toEdge(r));
  }

  async getAuditLog(
    principal: AnalyticsPrincipal,
    opts: {
      entityId?: string;
      eventType?: AuditEventType;
      limit?: number;
    } = {},
  ): Promise<AuditEntry[]> {
    const { tenantId } = principal;
    const limit = Math.min(opts.limit ?? 100, 1000);

    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let p = 2;

    if (opts.entityId) {
      conditions.push(`entity_id = $${p++}`);
      params.push(opts.entityId);
    }
    if (opts.eventType) {
      conditions.push(`event_type = $${p++}::gigalibs_analytics.audit_event_type`);
      params.push(opts.eventType);
    }

    params.push(limit);
    const result = await this.db.queryWithTenant<any>(
      tenantId,
      `SELECT id, event_type::text, actor_subject, entity_id, entity_type::text,
              event_payload, occurred_at::text
       FROM gigalibs_analytics.analytics_audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY occurred_at DESC
       LIMIT $${p}`,
      params,
    );
    return result.rows.map((r: any) => this.toAuditEntry(r));
  }

  private toEdge(r: Record<string, unknown>): LineageEdge {
    return {
      id: r['id'] as string,
      sourceNodeId: r['source_node_id'] as string,
      sourceNodeType: r['source_node_type'] as string,
      targetNodeId: r['target_node_id'] as string,
      targetNodeType: r['target_node_type'] as string,
      edgeLabel: (r['edge_label'] as string | null) ?? null,
      recordedBy: r['recorded_by'] as string,
      recordedAt: r['recorded_at'] as string,
    };
  }

  private toAuditEntry(r: Record<string, unknown>): AuditEntry {
    return {
      id: r['id'] as string,
      eventType: r['event_type'] as string,
      actorSubject: r['actor_subject'] as string,
      entityId: (r['entity_id'] as string | null) ?? null,
      entityType: (r['entity_type'] as string | null) ?? null,
      eventPayload: (r['event_payload'] as Record<string, unknown>) ?? {},
      occurredAt: r['occurred_at'] as string,
    };
  }
}
