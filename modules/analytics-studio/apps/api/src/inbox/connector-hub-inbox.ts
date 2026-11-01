/**
 * WI-OI-104e / WI-OI-105b: the Analytics relay inbox (ADR-0007 option A). Two producers deliver, each verified with its
 * own key and allowed only its own event: Connector Hub's pulled records, and Geospatial's place facts (which keep
 * Analytics' place directory). Connector Hub records: Only a relay token signed with the Analytics
 * inbox key by Connector Hub, bound to the exact body, reaches it; the web BFF does not route it and user contexts
 * are refused. Each CONNECTOR_RECORD_PULLED_V1 message is receipted once (duplicates are answered and ignored), and
 * stored as a raw record version of the tenant's CONNECTOR_HUB source for that Hub connection (created on first
 * delivery). Discovery, mapping and dataset builds then work on it as on any source. A message that can never be
 * accepted answers 400, which the relay dead-letters.
 */

import { createHash } from 'node:crypto';
import {
  type SpatialNodeChangedV1,
  SpatialNodeChangedV1Schema,
  TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2,
  WorkforcePositionFactV1Schema,
  RelayEnvelopeV1Schema,
  boundaryAreaM2,
  boundaryBoundingBox,
} from '@gigalibs/contracts';
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
import {
  BadRequestException,
  Body,
  type CanActivate,
  Controller,
  type ExecutionContext,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Module,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service.js';
import { DatasetModule } from '../datasets/dataset.module.js';
import { EntitlementSnapshotInboxService } from './entitlement-snapshot-inbox.service.js';
import { cmmsDowntimeToModuleFactIngest, workforcePositionToModuleFactIngest } from './module-fact-adapters.js';
import { ModuleFactIngestorService } from './module-fact-ingestor.service.js';
import { MODULE_ANALYTICS_CONTROL_TOTAL_V1, MODULE_ANALYTICS_FACT_V1 } from '@gigalibs/contracts';
import { ModuleSourceReconciliationService } from './module-source-reconciliation.service.js';
import { ModuleSourceReconciliationSweeper } from './module-source-reconciliation.sweeper.js';
import { EntitlementSnapshotReconciliationService } from './entitlement-snapshot-reconciliation.service.js';

export const ANALYTICS_INBOX_AUDIENCE = 'gigalibs-analytics-inbox';
export const ANALYTICS_RELAY_CONFIG = Symbol('ANALYTICS_RELAY_CONFIG');
export const ANALYTICS_GEOSPATIAL_RELAY_CONFIG = Symbol('ANALYTICS_GEOSPATIAL_RELAY_CONFIG');
export const ANALYTICS_WORKFORCE_RELAY_CONFIG = Symbol('ANALYTICS_WORKFORCE_RELAY_CONFIG');
export const ANALYTICS_CMMS_RELAY_CONFIG = Symbol('ANALYTICS_CMMS_RELAY_CONFIG');
export const ANALYTICS_CONTROL_PLANE_RELAY_CONFIG = Symbol('ANALYTICS_CONTROL_PLANE_RELAY_CONFIG');
export const ANALYTICS_ROUNDS_RELAY_CONFIG = Symbol('ANALYTICS_ROUNDS_RELAY_CONFIG');
export const ANALYTICS_RETENTION_CONFIG = Symbol('ANALYTICS_RETENTION_CONFIG');
export const HUB_RECORDS_TABLE = 'records';
const WORKFORCE_POSITION_FACT_EVENTS = Object.freeze([
  'WORKFORCE_POSITION_CREATED_V1',
  'WORKFORCE_POSITION_UPDATED_V1',
  'WORKFORCE_POSITION_SNAPSHOT_V1',
]);
const CMMS_DOWNTIME_FACT_EVENTS = Object.freeze(['DOWNTIME_STARTED_V1', 'DOWNTIME_ENDED_V1'] as const);
const ROUNDS_READING_EVENTS = Object.freeze(['READING_ACCEPTED_V1','EXCEPTION_RAISED_V1'] as const);
const ROUNDS_READING_PAYLOAD = z.object({
  aggregateId:z.uuid(),aggregateVersion:z.number().int().positive(),
  runId:z.uuid(),assignmentId:z.uuid(),routeId:z.uuid(),routeRevision:z.number().int().positive(),
  checkpointId:z.uuid(),assetRef:z.uuid(),meterRef:z.uuid().nullable(),
  owningUnitId:z.string().min(1).max(128).nullable().optional(),placeRef:z.uuid().nullable().optional(),
  numericValue:z.string().regex(/^-?\d{1,12}(?:\.\d{1,6})?$/).nullable(),
  choiceValue:z.string().min(1).max(64).nullable(),unitCode:z.string().min(1).max(32).nullable(),
  status:z.enum(['NORMAL','AMBER','RED']),source:z.literal('MANUAL'),
  proofMethod:z.enum(['NFC','BARCODE']),exceptionId:z.uuid().nullable(),
  capturedAt:z.iso.datetime({offset:true}),
}).passthrough();

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

/** WI-OI-105b: Geospatial signs its place facts with its own key for this inbox. */
export function loadAnalyticsGeospatialRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ANALYTICS_GEOSPATIAL_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'ANALYTICS_RELAY_GEOSPATIAL_URL',
    signingKey: 'GEOSPATIAL_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'ANALYTICS_RELAY_INTERVAL_MS',
    peerService: 'geospatial-api',
  });
}

/** WI-OI-109e3: Workforce has its own key and may send only position snapshot facts. */
export function loadAnalyticsWorkforceRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ANALYTICS_WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'ANALYTICS_RELAY_WORKFORCE_URL',
    signingKey: 'WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'ANALYTICS_RELAY_INTERVAL_MS',
    peerService: 'workforce-api',
  });
}

/** WI-OI-130: Analytics verifies CMMS-signed downtime facts (inbound only). */
export function loadAnalyticsCmmsRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ANALYTICS_CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'ANALYTICS_CMMS_OUTBOUND_TARGET_URL',
    signingKey: 'ANALYTICS_CMMS_OUTBOUND_SIGNING_KEY',
    interval: 'ANALYTICS_RELAY_INTERVAL_MS',
    peerService: 'cmms-api',
  });
}

/** WI-OI-131: control plane relays entitlement snapshots with its own inbox key. */
export function loadAnalyticsControlPlaneRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ANALYTICS_CONTROL_PLANE_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'ANALYTICS_CONTROL_PLANE_OUTBOUND_TARGET_URL',
    signingKey: 'ANALYTICS_CONTROL_PLANE_OUTBOUND_SIGNING_KEY',
    interval: 'ANALYTICS_RELAY_INTERVAL_MS',
    peerService: 'playground-api',
  });
}

export function loadAnalyticsRoundsRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ANALYTICS_ROUNDS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'ANALYTICS_ROUNDS_UNUSED_RELAY_URL',
    signingKey: 'ANALYTICS_ROUNDS_UNUSED_RELAY_KEY_BASE64',
    interval: 'ANALYTICS_RELAY_INTERVAL_MS',
    peerService: 'module-host',
  });
}

@Injectable()
export class ConnectorHubInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ANALYTICS_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: ANALYTICS_INBOX_AUDIENCE, source: 'connector-hub', label: 'Analytics' });
  }
}

@Injectable()
export class GeospatialInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ANALYTICS_GEOSPATIAL_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: ANALYTICS_INBOX_AUDIENCE, source: 'geospatial', label: 'Analytics (places)' });
  }
}

@Injectable()
export class WorkforceInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ANALYTICS_WORKFORCE_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: ANALYTICS_INBOX_AUDIENCE, source: 'workforce', label: 'Analytics (Workforce)' });
  }
}

@Injectable()
export class CmmsInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ANALYTICS_CMMS_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: ANALYTICS_INBOX_AUDIENCE, source: 'cmms', label: 'Analytics (CMMS downtime)' });
  }
}

@Injectable()
export class ControlPlaneInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ANALYTICS_CONTROL_PLANE_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: ANALYTICS_INBOX_AUDIENCE, source: 'control-plane', label: 'Analytics (entitlements)' });
  }
}

@Injectable()
export class RoundsInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ANALYTICS_ROUNDS_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: ANALYTICS_INBOX_AUDIENCE, source: 'operator-rounds', label: 'Analytics (Rounds)' });
  }
}

/** The inbox route's guard: a message passes when either producer's own key verifies it (the token names the producer). */
@Injectable()
export class AnalyticsRelayInboxGuard implements CanActivate {
  constructor(
    @Inject(ConnectorHubInboxGuard) private readonly hub: ConnectorHubInboxGuard,
    @Inject(GeospatialInboxGuard) private readonly geospatial: GeospatialInboxGuard,
    @Inject(WorkforceInboxGuard) private readonly workforce: WorkforceInboxGuard,
    @Inject(CmmsInboxGuard) private readonly cmms: CmmsInboxGuard,
    @Inject(ControlPlaneInboxGuard) private readonly controlPlane: ControlPlaneInboxGuard,
    @Inject(RoundsInboxGuard) private readonly rounds: RoundsInboxGuard,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    let first: unknown;
    for (const guard of [this.hub, this.geospatial, this.workforce, this.cmms, this.controlPlane, this.rounds]) {
      try {
        if (guard.canActivate(context)) return true;
      } catch (error) {
        first ??= error;
      }
    }
    throw first;
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

export function parseCmmsDowntimeFact(envelope: Partial<RelayEnvelope> | null) {
  if (
    !envelope ||
    !CMMS_DOWNTIME_FACT_EVENTS.includes(String(envelope.eventType) as (typeof CMMS_DOWNTIME_FACT_EVENTS)[number]) ||
    envelope.schemaVersion !== 1 ||
    !text(envelope.messageId, 64) ||
    !text(envelope.tenantId, 64) ||
    !text(envelope.aggregateId, 64) ||
    !Number.isSafeInteger(envelope.aggregateVersion) ||
    Number.isNaN(Date.parse(String(envelope.occurredAt)))
  ) {
    throw new BadRequestException('The CMMS downtime fact is incomplete.');
  }
  const payload = (envelope.payload ?? {}) as Record<string, unknown>;
  if (!text(payload.assetId, 64) || !text(payload.downtimeId, 64)) {
    throw new BadRequestException('The CMMS downtime fact payload is incomplete.');
  }
  return { envelope: envelope as RelayEnvelope, payload };
}

export function parseWorkforcePositionFact(envelope: Partial<RelayEnvelope> | null) {
  if (
    !envelope ||
    !WORKFORCE_POSITION_FACT_EVENTS.includes(String(envelope.eventType)) ||
    envelope.schemaVersion !== 1 ||
    !text(envelope.messageId, 64) ||
    !text(envelope.tenantId, 64) ||
    !text(envelope.aggregateId, 64) ||
    !Number.isSafeInteger(envelope.aggregateVersion) ||
    Number.isNaN(Date.parse(String(envelope.occurredAt)))
  ) {
    throw new BadRequestException('The Workforce position fact is incomplete.');
  }
  const fact = WorkforcePositionFactV1Schema.safeParse(envelope.payload);
  if (!fact.success) throw new BadRequestException(`The Workforce position fact is invalid: ${fact.error.issues[0]?.message ?? 'unknown'}`);
  if (fact.data.entityId !== envelope.aggregateId || fact.data.aggregateVersion !== envelope.aggregateVersion) {
    throw new BadRequestException('The Workforce position fact does not match its envelope.');
  }
  return { envelope: envelope as RelayEnvelope, fact: fact.data };
}

@Injectable()
export class ConnectorHubInboxService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(EntitlementSnapshotInboxService) private readonly entitlements: EntitlementSnapshotInboxService,
    @Inject(ModuleFactIngestorService) private readonly moduleFacts: ModuleFactIngestorService,
    @Inject(ModuleSourceReconciliationService) private readonly sourceReconciliation: ModuleSourceReconciliationService,
  ) {}

  /** Routes a verified message by its producer: each may deliver only its own event type. */
  async receiveFrom(source: string | undefined, body: unknown): Promise<{ status: string; sourceConnectionId?: string; placeId?: string }> {
    const eventType = (body as { eventType?: unknown } | null)?.eventType;
    if (source === 'control-plane' && eventType === TENANT_MODULE_ENTITLEMENTS_SNAPSHOT_V2) {
      return this.entitlements.receive(body);
    }
    if (eventType === MODULE_ANALYTICS_FACT_V1) {
      return this.moduleFacts.ingestFromRelayBody(source, body);
    }
    if (eventType === MODULE_ANALYTICS_CONTROL_TOTAL_V1) {
      return this.sourceReconciliation.receiveFromRelay(source, body);
    }
    if (source === 'geospatial' && eventType === 'SpatialNodeChangedV1') return this.receivePlace(body);
    if (source === 'connector-hub' && eventType === 'CONNECTOR_RECORD_PULLED_V1') return this.receive(body);
    if (source === 'workforce' && WORKFORCE_POSITION_FACT_EVENTS.includes(String(eventType))) {
      return this.receiveWorkforcePosition(body);
    }
    if (source === 'cmms' && CMMS_DOWNTIME_FACT_EVENTS.includes(String(eventType) as (typeof CMMS_DOWNTIME_FACT_EVENTS)[number])) {
      return this.receiveCmmsDowntime(body);
    }
    if (source === 'operator-rounds' && ROUNDS_READING_EVENTS.includes(String(eventType) as (typeof ROUNDS_READING_EVENTS)[number])) {
      return this.receiveRoundsReading(body);
    }
    throw new BadRequestException(`${String(source)} may not deliver ${String(eventType)} here.`);
  }

  /** Stores bounded inspection facts with source and capture time, separately from CMMS telemetry. */
  async receiveRoundsReading(body:unknown):Promise<{status:'stored'|'duplicate';sourceConnectionId?:string}> {
    const parsed=RelayEnvelopeV1Schema.safeParse(body);
    if (!parsed.success || parsed.data.schemaVersion!==1 ||
        !ROUNDS_READING_EVENTS.includes(parsed.data.eventType as (typeof ROUNDS_READING_EVENTS)[number]) ||
        parsed.data.aggregateType!=='reading')
      throw new BadRequestException('Invalid Rounds reading fact envelope.');
    const envelope=parsed.data;
    const fact=ROUNDS_READING_PAYLOAD.safeParse(envelope.payload);
    if (!fact.success || fact.data.aggregateId!==envelope.aggregateId ||
        fact.data.aggregateVersion!==envelope.aggregateVersion ||
        (envelope.eventType==='EXCEPTION_RAISED_V1')!==(fact.data.exceptionId!==null))
      throw new BadRequestException('Invalid Rounds reading fact payload.');
    const projected={readingId:envelope.aggregateId,runId:fact.data.runId,
      assignmentId:fact.data.assignmentId,routeId:fact.data.routeId,
      routeRevision:fact.data.routeRevision,checkpointId:fact.data.checkpointId,
      assetId:fact.data.assetRef,meterId:fact.data.meterRef,
      owningUnitId:fact.data.owningUnitId ?? null,placeRef:fact.data.placeRef ?? null,
      scopeKnown:Object.hasOwn(fact.data,'owningUnitId') && Object.hasOwn(fact.data,'placeRef'),
      numericValue:fact.data.numericValue,choiceValue:fact.data.choiceValue,
      unitCode:fact.data.unitCode,status:fact.data.status,source:fact.data.source,
      proofMethod:fact.data.proofMethod,exceptionId:fact.data.exceptionId,
      capturedAt:fact.data.capturedAt,acceptedAt:envelope.occurredAt,
      eventType:envelope.eventType};
    return this.db.withTenantTransaction(envelope.tenantId,async (client) => {
      const receipt=await client.query(
        `INSERT INTO gigalibs_analytics.inbox_receipts(message_id,tenant_id,source,event_type)
         VALUES($1,$2,'operator-rounds',$3) ON CONFLICT(message_id) DO NOTHING`,
        [envelope.messageId,envelope.tenantId,envelope.eventType],
      );
      if ((receipt.rowCount??0)===0) return {status:'duplicate' as const};
      const source=await client.query<{id:string}>(
        `INSERT INTO gigalibs_analytics.source_connections
         (tenant_id,display_name,source_type,status,created_by,module_source_key)
         VALUES($1,'Operator inspection readings','MODULE_EVENTS','ACTIVE','operator-rounds','operator-rounds:readings')
         ON CONFLICT(tenant_id,module_source_key) WHERE module_source_key IS NOT NULL
         DO UPDATE SET updated_at=now() RETURNING id`,[envelope.tenantId],
      );
      const sourceId=source.rows[0]!.id;
      const run=await client.query<{id:string}>(
        `INSERT INTO gigalibs_analytics.source_sync_runs
         (connection_id,tenant_id,status,rows_fetched,hub_sync_job_id,started_at,completed_at)
         VALUES($1,$2,'SUCCEEDED',1,$3,$4,$4)
         ON CONFLICT(connection_id,hub_sync_job_id) WHERE hub_sync_job_id IS NOT NULL
         DO UPDATE SET completed_at=GREATEST(gigalibs_analytics.source_sync_runs.completed_at,EXCLUDED.completed_at)
         RETURNING id`,[sourceId,envelope.tenantId,envelope.messageId,envelope.occurredAt],
      );
      await client.query(
        `INSERT INTO gigalibs_analytics.raw_record_versions
         (sync_run_id,connection_id,tenant_id,source_table_name,source_pk_hash,raw_payload,ingested_at)
         VALUES($1,$2,$3,'inspection_readings',$4,$5::jsonb,$6)`,
        [run.rows[0]!.id,sourceId,envelope.tenantId,
          createHash('sha256').update(envelope.aggregateId).digest('hex'),
          JSON.stringify(projected),envelope.occurredAt],
      );
      return {status:'stored' as const,sourceConnectionId:sourceId};
    });
  }

  /**
   * Stores an authenticated Workforce snapshot as a MODULE_EVENTS raw record. It then follows Analytics' existing
   * no-code discovery/mapping/build path; no cross-schema read or special chart is introduced.
   */
  async receiveCmmsDowntime(body: unknown): Promise<{ status: string; sourceConnectionId?: string; reasonCode?: string }> {
    const { envelope, payload } = parseCmmsDowntimeFact(body as Partial<RelayEnvelope>);
    const fact = cmmsDowntimeToModuleFactIngest(envelope, payload as Record<string, unknown>);
    return this.moduleFacts.ingest('cmms', envelope, fact);
  }

  async receiveWorkforcePosition(body: unknown): Promise<{ status: string; sourceConnectionId?: string; reasonCode?: string }> {
    const { envelope, fact } = parseWorkforcePositionFact(body as Partial<RelayEnvelope>);
    const ingest = workforcePositionToModuleFactIngest(envelope, fact);
    return this.moduleFacts.ingest('workforce', envelope, ingest);
  }

  /**
   * WI-OI-105b: applies a Geospatial place fact to the place directory when its version is not older than the one held
   * (a republished fact of the same version refreshes it). A move rewrites the paths of the places under it. Facts
   * written before carried no name, point or boundary; those keep what the directory has.
   */
  async receivePlace(body: unknown): Promise<{ status: 'applied' | 'stale'; placeId: string }> {
    const envelope = body as Partial<RelayEnvelope>;
    if (!text(envelope.tenantId, 64) || envelope.schemaVersion !== 1) throw new BadRequestException('The place fact is incomplete.');
    const parsed = SpatialNodeChangedV1Schema.safeParse(envelope.payload);
    if (!parsed.success) throw new BadRequestException(`The place fact is not valid: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    const place: SpatialNodeChangedV1 = parsed.data;
    const has = (key: keyof SpatialNodeChangedV1) => Object.hasOwn(envelope.payload as object, key);
    const box = boundaryBoundingBox(place.boundary ?? null);
    const area = place.areaM2 ?? boundaryAreaM2(place.boundary ?? null);
    return this.db.withTenantTransaction(envelope.tenantId, async (client) => {
      const applied = await client.query(
        `INSERT INTO gigalibs_analytics.place_directory
           (tenant_id, place_id, parent_id, path, depth, node_type_code, display_name, latitude, longitude, boundary,
            min_longitude, min_latitude, max_longitude, max_latitude, area_m2, status, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, now())
         ON CONFLICT (tenant_id, place_id) DO UPDATE SET
           parent_id = EXCLUDED.parent_id, path = EXCLUDED.path, depth = EXCLUDED.depth,
           node_type_code = EXCLUDED.node_type_code, status = EXCLUDED.status, version = EXCLUDED.version,
           display_name = CASE WHEN $18 THEN EXCLUDED.display_name ELSE gigalibs_analytics.place_directory.display_name END,
           latitude = CASE WHEN $19 THEN EXCLUDED.latitude ELSE gigalibs_analytics.place_directory.latitude END,
           longitude = CASE WHEN $19 THEN EXCLUDED.longitude ELSE gigalibs_analytics.place_directory.longitude END,
           boundary = CASE WHEN $20 THEN EXCLUDED.boundary ELSE gigalibs_analytics.place_directory.boundary END,
           min_longitude = CASE WHEN $20 THEN EXCLUDED.min_longitude ELSE gigalibs_analytics.place_directory.min_longitude END,
           min_latitude = CASE WHEN $20 THEN EXCLUDED.min_latitude ELSE gigalibs_analytics.place_directory.min_latitude END,
           max_longitude = CASE WHEN $20 THEN EXCLUDED.max_longitude ELSE gigalibs_analytics.place_directory.max_longitude END,
           max_latitude = CASE WHEN $20 THEN EXCLUDED.max_latitude ELSE gigalibs_analytics.place_directory.max_latitude END,
           area_m2 = CASE WHEN $20 THEN EXCLUDED.area_m2 ELSE gigalibs_analytics.place_directory.area_m2 END,
           updated_at = now()
         WHERE gigalibs_analytics.place_directory.version <= EXCLUDED.version`,
        [
          envelope.tenantId,
          place.nodeId,
          place.parentId,
          place.path,
          place.path.split('.').length,
          place.nodeTypeCode,
          place.displayName ?? null,
          place.latitude ?? null,
          place.longitude ?? null,
          place.boundary ? JSON.stringify(place.boundary) : null,
          box?.minLongitude ?? null,
          box?.minLatitude ?? null,
          box?.maxLongitude ?? null,
          box?.maxLatitude ?? null,
          area,
          place.status,
          place.aggregateVersion,
          has('displayName'),
          has('latitude'),
          has('boundary'),
        ],
      );
      if ((applied.rowCount ?? 0) === 0) return { status: 'stale' as const, placeId: place.nodeId };
      if (place.change === 'MOVED' && place.previousPath && place.previousPath !== place.path) {
        // The places under a moved place keep their own path below it and shift by the change in depth.
        await client.query(
          `UPDATE gigalibs_analytics.place_directory
              SET path = $2 || substring(path FROM length($3) + 1), depth = depth + $4, updated_at = now()
            WHERE tenant_id = $1 AND starts_with(path, $3 || '.')`,
          [envelope.tenantId, place.path, place.previousPath, place.path.split('.').length - place.previousPath.split('.').length],
        );
      }
      return { status: 'applied' as const, placeId: place.nodeId };
    });
  }

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
@UseGuards(AnalyticsRelayInboxGuard)
export class ConnectorHubInboxController {
  constructor(@Inject(ConnectorHubInboxService) private readonly inbox: ConnectorHubInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receiveFrom(request.relayClaims?.sub, body);
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
  imports: [DatasetModule],
  controllers: [ConnectorHubInboxController],
  providers: [
    { provide: ANALYTICS_RELAY_CONFIG, useFactory: () => loadAnalyticsRelayConfig() },
    { provide: ANALYTICS_GEOSPATIAL_RELAY_CONFIG, useFactory: () => loadAnalyticsGeospatialRelayConfig() },
    { provide: ANALYTICS_WORKFORCE_RELAY_CONFIG, useFactory: () => loadAnalyticsWorkforceRelayConfig() },
    { provide: ANALYTICS_CMMS_RELAY_CONFIG, useFactory: () => loadAnalyticsCmmsRelayConfig() },
    { provide: ANALYTICS_CONTROL_PLANE_RELAY_CONFIG, useFactory: () => loadAnalyticsControlPlaneRelayConfig() },
    { provide: ANALYTICS_ROUNDS_RELAY_CONFIG, useFactory: () => loadAnalyticsRoundsRelayConfig() },
    { provide: ANALYTICS_RETENTION_CONFIG, useFactory: () => loadOutboxRetentionConfig(process.env, 'ANALYTICS') },
    ConnectorHubInboxGuard,
    GeospatialInboxGuard,
    WorkforceInboxGuard,
    CmmsInboxGuard,
    ControlPlaneInboxGuard,
    RoundsInboxGuard,
    AnalyticsRelayInboxGuard,
    ConnectorHubInboxService,
    EntitlementSnapshotInboxService,
    ModuleFactIngestorService,
    ModuleSourceReconciliationService,
    ModuleSourceReconciliationSweeper,
    EntitlementSnapshotReconciliationService,
    AnalyticsInboxRetention,
  ],
})
export class ConnectorHubInboxModule {}
