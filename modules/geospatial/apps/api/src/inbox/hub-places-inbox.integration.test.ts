import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeospatialDatabaseService } from '../database/database.service.js';
import { PlacesService } from '../places/places.service.js';
import { HubPlacesInboxService } from './hub-places-inbox.js';

const databaseUrl = process.env.GEOSPATIAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const TENANT = 'geo-a';
const square = (x: number, y: number, size: number) => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]],
});
const envelope = (sourceId: string, version: number, place: Record<string, unknown>, messageId = `evt-${randomUUID()}`) => ({
  messageId,
  tenantId: TENANT,
  eventType: 'CONNECTOR_PLACE_PULLED_V1',
  aggregateType: 'connector_place',
  aggregateId: `conn-geo:${sourceId}`,
  aggregateVersion: version,
  correlationId: 'sync-hub-1',
  causationId: null,
  schemaVersion: 1,
  payload: {
    hubConnectionId: 'conn-geo',
    connectionName: 'farmOS land',
    syncJobId: 'sync-hub-1',
    sourceId,
    place: { nodeTypeCode: 'FIELD', code: null, name: null, parentSourceId: null, geometry: null, ...place },
  },
  occurredAt: '2026-09-30T12:00:00.000Z',
});

// WI-OI-105e on PostgreSQL with the real migrations and the non-superuser runtime role (RLS forced).
integration('Geospatial inbox for places pulled by Connector Hub', () => {
  let db: GeospatialDatabaseService;
  let inbox: HubPlacesInboxService;
  const receive = (body: ReturnType<typeof envelope>) => inbox.receive(body, JSON.stringify(body));
  const query = <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) =>
    db.withTenantTransaction(TENANT, async (client) => (await client.query<T>(sql, values)).rows);
  const link = async (sourceId: string) =>
    (await query<{ place_id: string | null; status: string; reason: string | null; source_version: number }>(
      'SELECT place_id, status, reason, source_version FROM gigalibs_geospatial.place_source_links WHERE source_id = $1',
      [sourceId],
    ))[0];
  const node = async (id: string) =>
    (await query<{ path: string; display_name: string; area_m2: string | null; updated_by: string }>(
      'SELECT path::text AS path, display_name, area_m2, updated_by FROM gigalibs_geospatial.spatial_nodes WHERE id = $1',
      [id],
    ))[0]!;

  beforeAll(async () => {
    db = new GeospatialDatabaseService({ databaseUrl, databasePoolSize: 3, expectedMigrationVersion: 8 } as never);
    await db.onModuleInit();
    inbox = new HubPlacesInboxService(db, new PlacesService(db));
  });
  afterAll(async () => {
    await db?.onModuleDestroy();
  });

  it('creates a farm and a field inside it from GeoJSON and WKT, linked to their source ids, once per message', async () => {
    const farm = await receive(envelope('farm-1', 1, { nodeTypeCode: 'FARM', code: 'HUB-FARM 1', name: 'Hub farm', geometry: square(77.6, 12.9, 0.02) }));
    expect(farm).toMatchObject({ status: 'PROCESSED', change: 'CREATED' });
    const farmId = (farm as { placeId: string }).placeId;
    expect(await node(farmId)).toMatchObject({ path: 'HUB_FARM_1', display_name: 'Hub farm', updated_by: 'connector-hub:conn-geo' });
    const fieldMessage = envelope('field-1', 1, {
      code: 'F-1',
      name: 'Field one',
      parentSourceId: 'farm-1',
      geometry: 'POLYGON ((77.6 12.9, 77.61 12.9, 77.61 12.91, 77.6 12.91, 77.6 12.9))',
    });
    const field = await receive(fieldMessage);
    const fieldId = (field as { placeId: string }).placeId;
    const stored = await node(fieldId);
    expect(stored.path).toBe('HUB_FARM_1.F_1');
    expect(Number(stored.area_m2)).toBeGreaterThan(1_190_000);
    expect(await link('field-1')).toMatchObject({ place_id: fieldId, status: 'LINKED', source_version: 1 });
    expect(await receive(fieldMessage)).toEqual({ status: 'DUPLICATE' });
    // Each change produced the place fact that Analytics' place directory is built from.
    const facts = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gigalibs_geospatial.outbox_events WHERE event_type = 'SpatialNodeChangedV1' AND aggregate_id = ANY($1)`,
      [[farmId, fieldId]],
    );
    expect(facts[0]!.n).toBe(2);
  });

  it('asks for a retry while the parent has not arrived, leaving no trace', async () => {
    const early = envelope('field-9', 1, { parentSourceId: 'farm-9', geometry: square(77.6, 12.9, 0.001) });
    await expect(receive(early)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(await link('field-9')).toBeUndefined();
    const receipts = await query('SELECT 1 FROM gigalibs_geospatial.inbox_receipts WHERE message_id = $1', [early.messageId]);
    expect(receipts).toHaveLength(0);
  });

  it('keeps records that cannot become places with the reason, and never breaks the transaction', async () => {
    expect(await receive(envelope('bad-geo', 1, { geometry: 'LINESTRING (0 0, 1 1)' }))).toMatchObject({ status: 'REJECTED', code: 'GEOMETRY_INVALID' });
    expect(await link('bad-geo')).toMatchObject({ status: 'REJECTED', place_id: null });
    expect(await receive(envelope('odd-type', 1, { nodeTypeCode: 'ORCHARD', geometry: square(77.7, 12.9, 0.001) }))).toMatchObject({
      code: 'NODE_TYPE_UNKNOWN',
    });
    // The seeded NORTH place already has this code at the top level.
    const clash = await receive(envelope('north-copy', 1, { nodeTypeCode: 'FARM', code: 'NORTH', geometry: square(77.8, 12.9, 0.01) }));
    expect(clash).toMatchObject({ status: 'REJECTED', code: 'GEOSPATIAL_UNIQUE_CONFLICT' });
    expect(await link('north-copy')).toMatchObject({ status: 'REJECTED' });
    const failed = await query<{ status: string; last_error_code: string }>(
      `SELECT status, last_error_code FROM gigalibs_geospatial.inbox_receipts WHERE consumer_name = 'hub-places' AND status = 'FAILED' ORDER BY received_at`,
    );
    expect(failed.map((receipt) => receipt.last_error_code)).toEqual(['GEOMETRY_INVALID', 'NODE_TYPE_UNKNOWN', 'GEOSPATIAL_UNIQUE_CONFLICT']);
  });

  it('updates and moves the linked place on a newer version, ignores an older one, and keeps it when a version is bad', async () => {
    await receive(envelope('farm-2', 1, { nodeTypeCode: 'FARM', code: 'HUB_FARM_2', name: 'Second farm', geometry: 'POINT (77.65 12.95)' }));
    const fieldId = (await link('field-1'))!.place_id!;
    const moved = await receive(envelope('field-1', 2, { code: 'F-1', name: 'Field one (east)', parentSourceId: 'farm-2', geometry: square(77.65, 12.95, 0.005) }));
    expect(moved).toMatchObject({ status: 'PROCESSED', placeId: fieldId, change: 'UPDATED' });
    expect(await node(fieldId)).toMatchObject({ path: 'HUB_FARM_2.F_1', display_name: 'Field one (east)' });
    expect(await receive(envelope('field-1', 1, { code: 'F-1', name: 'Old name', parentSourceId: 'farm-1' }))).toMatchObject({ change: 'STALE' });
    expect(await receive(envelope('field-1', 3, { code: 'F-1', name: 'Field one (east)', parentSourceId: 'farm-2', geometry: square(77.65, 12.95, 0.005) }))).toMatchObject({
      change: 'UNCHANGED',
    });
    expect(await receive(envelope('field-1', 4, { parentSourceId: 'farm-2', geometry: { type: 'Polygon', coordinates: [] } }))).toMatchObject({
      status: 'REJECTED',
      placeId: fieldId,
    });
    expect(await link('field-1')).toMatchObject({ status: 'LINKED', place_id: fieldId, source_version: 4, reason: expect.stringMatching(/^The latest version was not applied/) });
    expect((await node(fieldId)).display_name).toBe('Field one (east)');
  });
});
