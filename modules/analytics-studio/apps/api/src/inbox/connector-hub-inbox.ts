/**
 * WI-OI-104e: the Analytics inbox for Connector Hub (ADR-0007 option A). Only a relay token signed with the Analytics
 * inbox key by Connector Hub, bound to the exact body, reaches it; the web BFF does not route it and user contexts
 * are refused. Each CONNECTOR_RECORD_PULLED_V1 message is receipted once (duplicates are answered and ignored), and
 * stored as a raw record version of the tenant's CONNECTOR_HUB source for that Hub connection (created on first
 * delivery). Discovery, mapping and dataset builds then work on it as on any source. A message that can never be
 * accepted answers 400, which the relay dead-letters.
 */

import { createHash } from 'node:crypto';
import {
  type OutboxRetentionConfig,
  OutboxRetentionSweeper,
  type RelayConfig,
  type RelayEnvelope,
  RelayInboxGuardBase,
  type RelayRequest,
  loadOutboxRetentionConfig,
  loadRelayConfig,
} from '@gigalibs/module-sdk';
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Inject, Injectable, Module, Post, Req, UseGuards } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export const ANALYTICS_INBOX_AUDIENCE = 'gigalibs-analytics-inbox';
export const ANALYTICS_RELAY_CONFIG = Symbol('ANALYTICS_RELAY_CONFIG');
export const ANALYTICS_RETENTION_CONFIG = Symbol('ANALYTICS_RETENTION_CONFIG');
export const HUB_RECORDS_TABLE = 'records';

export function loadAnalyticsRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ANALYTICS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    // Analytics sends nothing to Connector Hub.
    targetUrl: 'ANALYTICS_RELAY_CONNECTOR_HUB_URL',
    signingKey: 'CONNECTOR_HUB_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'ANALYTICS_RELAY_INTERVAL_MS',
    peerService: 'connector-hub-api',
  });
}

@Injectable()
export class ConnectorHubInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ANALYTICS_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: ANALYTICS_INBOX_AUDIENCE, source: 'connector-hub', label: 'Analytics' });
  }
}

interface PulledRecord {
  readonly hubConnectionId: string;
  readonly connectionName: string;
  readonly syncJobId: string;
  readonly sourceId: string;
  readonly record: Record<string, unknown>;
}

const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

export function parsePulledRecord(envelope: Partial<RelayEnvelope> | null): { envelope: RelayEnvelope; record: PulledRecord } {
  if (!envelope || envelope.eventType !== 'CONNECTOR_RECORD_PULLED_V1' || envelope.schemaVersion !== 1) {
    throw new BadRequestException('Only CONNECTOR_RECORD_PULLED_V1 (schema 1) is accepted.');
  }
  const payload = (envelope.payload ?? {}) as Record<string, unknown>;
  const record = payload.record;
  if (
    !text(envelope.messageId, 64) ||
    !text(envelope.tenantId, 64) ||
    !text(payload.hubConnectionId, 64) ||
    !text(payload.connectionName, 128) ||
    !text(payload.syncJobId, 64) ||
    !text(payload.sourceId, 256) ||
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    Number.isNaN(Date.parse(String(envelope.occurredAt)))
  ) {
    throw new BadRequestException('The pulled record message is incomplete.');
  }
  return {
    envelope: envelope as RelayEnvelope,
    record: {
      hubConnectionId: payload.hubConnectionId,
      connectionName: payload.connectionName,
      syncJobId: payload.syncJobId,
      sourceId: payload.sourceId,
      record: record as Record<string, unknown>,
    },
  };
}

@Injectable()
export class ConnectorHubInboxService {
  constructor(private readonly db: DatabaseService) {}

  async receive(body: unknown): Promise<{ status: 'stored' | 'duplicate'; sourceConnectionId?: string }> {
    const { envelope, record } = parsePulledRecord(body as Partial<RelayEnvelope>);
    return this.db.withTenantTransaction(envelope.tenantId, async (client) => {
      const receipt = await client.query(
        `INSERT INTO gigalibs_analytics.inbox_receipts (message_id, tenant_id, source, event_type)
         VALUES ($1, $2, 'connector-hub', $3) ON CONFLICT (message_id) DO NOTHING`,
        [envelope.messageId, envelope.tenantId, envelope.eventType],
      );
      if ((receipt.rowCount ?? 0) === 0) return { status: 'duplicate' as const };
      const source = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.source_connections
           (tenant_id, display_name, source_type, status, created_by, hub_connection_id)
         VALUES ($1, $2, 'CONNECTOR_HUB', 'ACTIVE', 'connector-hub', $3)
         ON CONFLICT (tenant_id, hub_connection_id) WHERE hub_connection_id IS NOT NULL
         DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
         RETURNING id`,
        [envelope.tenantId, record.connectionName, record.hubConnectionId],
      );
      const sourceId = source.rows[0]!.id;
      const run = await client.query<{ id: string }>(
        `INSERT INTO gigalibs_analytics.source_sync_runs (connection_id, tenant_id, status, rows_fetched, hub_sync_job_id, started_at, completed_at)
         VALUES ($1, $2, 'SUCCEEDED', 1, $3, $4, $4)
         ON CONFLICT (connection_id, hub_sync_job_id) WHERE hub_sync_job_id IS NOT NULL
         DO UPDATE SET rows_fetched = gigalibs_analytics.source_sync_runs.rows_fetched + 1,
                       completed_at = GREATEST(gigalibs_analytics.source_sync_runs.completed_at, EXCLUDED.completed_at)
         RETURNING id`,
        [sourceId, envelope.tenantId, record.syncJobId, envelope.occurredAt],
      );
      await client.query(
        `INSERT INTO gigalibs_analytics.raw_record_versions
           (sync_run_id, connection_id, tenant_id, source_table_name, source_pk_hash, raw_payload, ingested_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          run.rows[0]!.id,
          sourceId,
          envelope.tenantId,
          HUB_RECORDS_TABLE,
          createHash('sha256').update(record.sourceId).digest('hex'),
          JSON.stringify(record.record),
          // When Connector Hub pulled it, so the latest version wins however deliveries interleave.
          envelope.occurredAt,
        ],
      );
      return { status: 'stored' as const, sourceConnectionId: sourceId };
    });
  }
}

@Controller('internal/v1/inbox')
@UseGuards(ConnectorHubInboxGuard)
export class ConnectorHubInboxController {
  constructor(@Inject(ConnectorHubInboxService) private readonly inbox: ConnectorHubInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() _request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body);
  }
}

/** Deletes inbox receipts after ANALYTICS_INBOX_RECEIPT_RETENTION_DAYS (default 90). */
@Injectable()
export class AnalyticsInboxRetention extends OutboxRetentionSweeper {
  constructor(@Inject(DatabaseService) database: DatabaseService, @Inject(ANALYTICS_RETENTION_CONFIG) config: OutboxRetentionConfig) {
    super(database, config);
  }
}

@Module({
  controllers: [ConnectorHubInboxController],
  providers: [
    { provide: ANALYTICS_RELAY_CONFIG, useFactory: () => loadAnalyticsRelayConfig() },
    { provide: ANALYTICS_RETENTION_CONFIG, useFactory: () => loadOutboxRetentionConfig(process.env, 'ANALYTICS') },
    ConnectorHubInboxGuard,
    ConnectorHubInboxService,
    AnalyticsInboxRetention,
  ],
})
export class ConnectorHubInboxModule {}
