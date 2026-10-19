import { generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { verifyRelayToken } from '@gigalibs/auth-core';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeospatialDatabaseService } from '../database/database.service.js';
import { PlacesService } from '../places/places.service.js';
import { AnalyticsPlaceRelay } from './analytics-relay.js';

const databaseUrl = process.env.GEOSPATIAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const TENANT = 'geo-a';
const FARM_TYPE = '00000000-0000-4000-8000-0000000000f1';
const NORTH = '00000000-0000-4000-8000-0000000000a1';
const principal = (spatialScope: { mode: 'UNBOUNDED' } | { mode: 'SCOPED_PLACES'; placeIds: string[] } = { mode: 'UNBOUNDED' }) => ({
  tenantId: TENANT,
  subject: 'steward-1',
  sessionId: 'session-1',
  authVersion: 1,
  permissions: ['maps:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN' as const,
  orgScope: { mode: 'FLAT_TENANT' as const },
  spatialScope,
});

// WI-OI-105a/b on PostgreSQL with the real migrations and the non-superuser runtime role (RLS forced). The harness
// seeded one place with two old-style facts and a node-type fact before migration 000005 ran.
integration('Geospatial places reach Analytics', () => {
  let db: GeospatialDatabaseService;
  const facts = async () =>
    db.withTenantTransaction(TENANT, async (client) =>
      (await client.query<{ id: string; event_type: string; aggregate_version: number; status: string; last_error_code: string | null; payload: Record<string, unknown> }>(
        `SELECT id, event_type, aggregate_version, status, last_error_code, payload FROM gigalibs_geospatial.outbox_events ORDER BY id`,
      )).rows,
    );

  beforeAll(async () => {
    db = new GeospatialDatabaseService({ databaseUrl, databasePoolSize: 3, expectedMigrationVersion: 8 } as never);
    await db.onModuleInit();
  });
  afterAll(async () => {
    await db?.onModuleDestroy();
  });

  it('brings each place latest fact up to its current state and closes older versions as superseded', async () => {
    const byId = Object.fromEntries((await facts()).map((fact) => [fact.id, fact]));
    expect(byId['old-1']).toMatchObject({ status: 'PUBLISHED', last_error_code: 'SUPERSEDED_BY_BACKFILL' });
    expect(byId['old-2']).toMatchObject({ status: 'PENDING', aggregate_version: 2 });
    expect(byId['old-2']!.payload).toMatchObject({ nodeId: NORTH, displayName: 'North farm', boundary: { type: 'Polygon' }, aggregateVersion: 2 });
    expect(byId['type-1']).toMatchObject({ status: 'PENDING' });
  });

  it('relays place facts, signed with Geospatial own key, to the Analytics inbox and leaves unrouted facts', async () => {
    const pair = generateKeyPairSync('ed25519');
    const publicPem = pair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const received: Array<Record<string, unknown>> = [];
    const inbox = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      try {
        verifyRelayToken(String(request.headers.authorization).replace('Bearer ', ''), publicPem, { audience: 'gigalibs-analytics-inbox', source: 'geospatial', body });
      } catch {
        return response.writeHead(401).end();
      }
      received.push(JSON.parse(body) as Record<string, unknown>);
      response.writeHead(202).end('{}');
    });
    await new Promise<void>((resolve) => inbox.listen(0, '127.0.0.1', resolve));
    try {
      const relay = new AnalyticsPlaceRelay(db, {
        inboxPublicKey: null,
        outbound: {
          targetOrigin: `http://127.0.0.1:${(inbox.address() as AddressInfo).port}`,
          privateKey: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
          inboxPath: '/internal/v1/inbox',
        },
        intervalMs: 1000,
      });
      expect(await relay.tick()).toBe(1);
      expect(received).toMatchObject([{ tenantId: TENANT, eventType: 'SpatialNodeChangedV1', payload: { nodeId: NORTH, displayName: 'North farm' } }]);
      const byId = Object.fromEntries((await facts()).map((fact) => [fact.id, fact]));
      expect([byId['old-2']!.status, byId['type-1']!.status]).toEqual(['PUBLISHED', 'PENDING']);
      expect(await relay.tick()).toBe(0);
    } finally {
      await new Promise<void>((resolve) => inbox.close(() => resolve()));
    }
  });

  it('stores the area of a new field in SQL, and republishes every place for a member without a place scope', async () => {
    const places = new PlacesService(db);
    const created = await places.createNode(
      { principal: principal(), correlationId: 'corr-105' },
      { code: 'SOUTH', displayName: 'South farm', nodeTypeId: FARM_TYPE, boundary: { type: 'Polygon', coordinates: [[[77.52, 12.9], [77.53, 12.9], [77.53, 12.91], [77.52, 12.91], [77.52, 12.9]]] } },
    );
    const stored = await db.withTenantTransaction(TENANT, async (client) =>
      (await client.query<{ area_m2: string }>('SELECT area_m2 FROM gigalibs_geospatial.spatial_nodes WHERE id = $1', [created.id])).rows[0]!.area_m2,
    );
    // About 1.085 km × 1.106 km at 12.9° N.
    expect(Number(stored)).toBeGreaterThan(1_190_000);
    expect(Number(stored)).toBeLessThan(1_210_000);
    expect(created.areaM2).toBe(Number(stored));
    await expect(places.republishPlaces({ principal: principal({ mode: 'SCOPED_PLACES', placeIds: [NORTH] }), correlationId: 'corr-r' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(await places.republishPlaces({ principal: principal(), correlationId: 'corr-r' })).toEqual({ republished: 2 });
    const pending = (await facts()).filter((fact) => fact.event_type === 'SpatialNodeChangedV1' && fact.status === 'PENDING');
    expect(pending.map((fact) => fact.payload.displayName).sort()).toEqual(['North farm', 'South farm']);
  });
});
