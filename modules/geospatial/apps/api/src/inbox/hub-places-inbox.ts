/**
 * WI-OI-105e (ADR-0007, ADR-0016 F15): places pulled by Connector Hub. The Hub's relay delivers one
 * CONNECTOR_PLACE_PULLED_V1 fact per new record version, signed with the Hub's key for this inbox. Each fact creates
 * the place linked to its source record, or updates (and, when its parent changed, moves) the place already linked,
 * through the same place commands people use, so area, audit and the place facts for Analytics follow. The receipt,
 * the link and the place change commit together. A record that cannot become a place is kept with the reason; a
 * record whose parent has not arrived yet is answered 503 so the relay retries it later.
 */

import {
  CONNECTOR_PLACE_PULLED_V1,
  type ConnectorPlacePulledV1,
  ConnectorPlacePulledV1Schema,
  CreateSpatialNodeV1Schema,
  type SpatialBoundaryV1,
  parsePlaceGeometry,
  placeCodeFrom,
} from '@gigalibs/contracts';
import { type RelayConfig, RelayInboxGuardBase, type RelayRequest, receiveOnce } from '@gigalibs/module-sdk';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GeospatialPrincipal } from '../auth/authorization.js';
import { GeospatialDatabaseService } from '../database/database.service.js';
import { type CommandContext, PlacesService } from '../places/places.service.js';
import { GEOSPATIAL_RELAY_CONFIG } from '../relay/analytics-relay.js';

export const GEOSPATIAL_INBOX_AUDIENCE = 'gigalibs-geospatial-inbox';

interface Envelope {
  readonly messageId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly aggregateVersion: number;
  readonly correlationId: string;
  readonly schemaVersion: number;
  readonly payload: unknown;
}

function envelopeOf(body: unknown): Envelope | null {
  const value = (body ?? {}) as Record<string, unknown>;
  const text = (key: string, max: number) => typeof value[key] === 'string' && (value[key] as string).length > 0 && (value[key] as string).length <= max;
  const positive = (key: string) => Number.isInteger(value[key]) && (value[key] as number) > 0;
  const valid =
    text('messageId', 128) && text('tenantId', 64) && text('eventType', 128) && text('correlationId', 128) &&
    positive('aggregateVersion') && positive('schemaVersion') && 'payload' in value;
  return valid ? (value as unknown as Envelope) : null;
}

export type HubPlaceOutcome =
  | { readonly status: 'PROCESSED'; readonly placeId: string | null; readonly change: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'STALE' }
  | { readonly status: 'REJECTED'; readonly code: string; readonly reason: string; readonly placeId: string | null };

interface Link {
  readonly place_id: string | null;
  readonly source_version: number;
  readonly status: 'LINKED' | 'REJECTED';
}

@Injectable()
export class HubPlacesInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(GEOSPATIAL_RELAY_CONFIG) config: RelayConfig) {
    super(config, { audience: GEOSPATIAL_INBOX_AUDIENCE, source: 'connector-hub', label: 'Geospatial' });
  }
}

@Injectable()
export class HubPlacesInboxService {
  constructor(
    private readonly database: GeospatialDatabaseService,
    private readonly places: PlacesService,
  ) {}

  async receive(body: unknown, rawBody: string): Promise<HubPlaceOutcome | { readonly status: 'DUPLICATE' }> {
    const envelope = envelopeOf(body);
    if (!envelope) throw new BadRequestException('The relay envelope is incomplete.');
    if (envelope.eventType !== CONNECTOR_PLACE_PULLED_V1) {
      throw new BadRequestException(`Only ${CONNECTOR_PLACE_PULLED_V1} is accepted here.`);
    }
    const fact = ConnectorPlacePulledV1Schema.safeParse(envelope.payload);
    if (!fact.success) throw new BadRequestException('The place fact is incomplete.');
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(
        client,
        { schema: 'gigalibs_geospatial', consumer: 'hub-places', sourceModule: 'connector-hub' },
        envelope,
        rawBody,
        () => this.apply(client, envelope, fact.data),
      ),
    );
  }

  private async apply(client: PoolClient, envelope: Envelope, fact: ConnectorPlacePulledV1): Promise<HubPlaceOutcome> {
    const tenantId = envelope.tenantId;
    const version = envelope.aggregateVersion;
    const link = (
      await client.query<Link>(
        `SELECT place_id, source_version, status FROM gigalibs_geospatial.place_source_links
          WHERE tenant_id = $1 AND hub_connection_id = $2 AND source_id = $3 FOR UPDATE`,
        [tenantId, fact.hubConnectionId, fact.sourceId],
      )
    ).rows[0];
    const linkedPlace = link?.status === 'LINKED' ? link.place_id : null;
    if (link && link.source_version >= version) return { status: 'PROCESSED', placeId: linkedPlace, change: 'STALE' };

    const context: CommandContext = { principal: hubPrincipal(tenantId, fact.hubConnectionId), correlationId: envelope.correlationId };
    const save = (status: 'LINKED' | 'REJECTED', placeId: string | null, reason: string | null) =>
      client.query(
        `INSERT INTO gigalibs_geospatial.place_source_links
           (tenant_id, hub_connection_id, source_id, place_id, source_version, status, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, hub_connection_id, source_id)
         DO UPDATE SET place_id = EXCLUDED.place_id, source_version = EXCLUDED.source_version, status = EXCLUDED.status,
                       reason = EXCLUDED.reason, updated_at = now()`,
        [tenantId, fact.hubConnectionId, fact.sourceId, placeId, version, status, reason?.slice(0, 400) ?? null],
      );
    // A place already made keeps its link; the reason says the latest version was not applied.
    const reject = async (code: string, reason: string): Promise<HubPlaceOutcome> => {
      await save(linkedPlace ? 'LINKED' : 'REJECTED', linkedPlace, linkedPlace ? `The latest version was not applied: ${reason}` : reason);
      return { status: 'REJECTED', code, reason, placeId: linkedPlace };
    };

    const geometry = parsePlaceGeometry(fact.place.geometry);
    if ('error' in geometry) return reject('GEOMETRY_INVALID', geometry.error);
    const nodeType = (
      await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_geospatial.spatial_node_types WHERE tenant_id = $1 AND code = $2 AND status = 'ACTIVE'`,
        [tenantId, fact.place.nodeTypeCode],
      )
    ).rows[0];
    if (!nodeType) return reject('NODE_TYPE_UNKNOWN', `There is no active place type ${fact.place.nodeTypeCode}.`);
    const code = placeCodeFrom(fact.place.code ?? fact.sourceId);
    if (!code) return reject('CODE_INVALID', 'The place code has no letters or digits.');
    const displayName = (fact.place.name ?? '').trim().slice(0, 200) || code;

    let parentId: string | null = null;
    if (fact.place.parentSourceId) {
      const parent = (
        await client.query<Link>(
          `SELECT place_id, source_version, status FROM gigalibs_geospatial.place_source_links
            WHERE tenant_id = $1 AND hub_connection_id = $2 AND source_id = $3`,
          [tenantId, fact.hubConnectionId, fact.place.parentSourceId],
        )
      ).rows[0];
      // Not arrived yet: the relay retries with back-off, so a parent later in the same pull is found.
      if (!parent) throw new ServiceUnavailableException({ code: 'PARENT_NOT_YET_KNOWN', message: 'The parent place has not arrived yet.' });
      if (!parent.place_id) return reject('PARENT_REJECTED', `The parent ${fact.place.parentSourceId} could not be made a place.`);
      parentId = parent.place_id;
    }

    const attributes = { displayName, boundary: geometry.boundary, latitude: geometry.latitude, longitude: geometry.longitude };
    // A refused place command must not abort the transaction the receipt and link are in.
    await client.query('SAVEPOINT hub_place');
    try {
      if (linkedPlace) {
        let current = await nodeState(client, tenantId, linkedPlace);
        if (current.parent_id !== parentId) {
          await this.places.moveNodeIn(client, context, linkedPlace, { expectedVersion: current.version, newParentId: parentId });
          current = await nodeState(client, tenantId, linkedPlace);
        }
        const changed =
          current.display_name !== displayName ||
          !sameBoundary(current.boundary, geometry.boundary) ||
          current.latitude !== geometry.latitude ||
          current.longitude !== geometry.longitude;
        if (changed) await this.places.updateNodeIn(client, context, linkedPlace, { expectedVersion: current.version, ...attributes });
        await client.query('RELEASE SAVEPOINT hub_place');
        await save('LINKED', linkedPlace, null);
        return { status: 'PROCESSED', placeId: linkedPlace, change: changed ? 'UPDATED' : 'UNCHANGED' };
      }
      const input = CreateSpatialNodeV1Schema.safeParse({ code, nodeTypeId: nodeType.id, parentId, ...attributes });
      if (!input.success) {
        await client.query('RELEASE SAVEPOINT hub_place');
        return reject('PLACE_INVALID', input.error.issues[0]?.message ?? 'The place is not valid.');
      }
      const created = await this.places.createNodeIn(client, context, input.data);
      await client.query('RELEASE SAVEPOINT hub_place');
      await save('LINKED', created.id, null);
      return { status: 'PROCESSED', placeId: created.id, change: 'CREATED' };
    } catch (error) {
      if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;
      await client.query('ROLLBACK TO SAVEPOINT hub_place');
      const response = error.getResponse() as { code?: string; message?: string } | string;
      const reason = typeof response === 'string' ? response : (response.message ?? error.message);
      return reject(typeof response === 'string' ? 'PLACE_REFUSED' : (response.code ?? 'PLACE_REFUSED'), String(reason));
    }
  }
}

/** Place changes from the Hub are recorded as the connection's, with no place scope. */
function hubPrincipal(tenantId: string, connectionId: string): GeospatialPrincipal {
  return Object.freeze({
    tenantId,
    subject: `connector-hub:${connectionId}`.slice(0, 128),
    sessionId: 'connector-hub-relay',
    authVersion: 1,
    permissions: Object.freeze(['maps.nodes.manage']),
    roles: Object.freeze([]),
    persona: 'TENANT_ADMIN',
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope: { mode: 'UNBOUNDED' },
  }) as GeospatialPrincipal;
}

async function nodeState(client: PoolClient, tenantId: string, placeId: string) {
  const result = await client.query<{
    version: number;
    parent_id: string | null;
    display_name: string;
    boundary: SpatialBoundaryV1 | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `SELECT version, parent_id, display_name, boundary, latitude::double precision AS latitude,
            longitude::double precision AS longitude
       FROM gigalibs_geospatial.spatial_nodes WHERE tenant_id = $1 AND id = $2`,
    [tenantId, placeId],
  );
  return result.rows[0]!;
}

// Stored JSONB does not keep key order, so the parts are compared.
function sameBoundary(left: SpatialBoundaryV1 | null, right: SpatialBoundaryV1 | null): boolean {
  if (!left || !right) return left === right;
  return left.type === right.type && JSON.stringify(left.coordinates) === JSON.stringify(right.coordinates);
}

@Controller('internal/v1/inbox')
@UseGuards(HubPlacesInboxGuard)
export class HubPlacesInboxController {
  constructor(private readonly inbox: HubPlacesInboxService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RelayRequest, @Body() body: unknown) {
    return this.inbox.receive(body, request.rawBody!.toString('utf8'));
  }
}
