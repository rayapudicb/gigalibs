import { SHIPPED_INDUSTRY_PACKS } from '@gigalibs/contracts';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GeospatialDatabaseService } from '../database/database.service.js';
import { PlacesService } from '../places/places.service.js';
import { GeospatialPackService } from './pack.service.js';

const databaseUrl = process.env.GEOSPATIAL_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const TENANT = 'geo-pack';
const principal = (spatialScope: { mode: 'UNBOUNDED' } | { mode: 'SCOPED_PLACES'; placeIds: string[] } = { mode: 'UNBOUNDED' }) => ({
  tenantId: TENANT,
  subject: 'admin-1',
  sessionId: 'job:job-1',
  authVersion: 1,
  permissions: ['maps:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN' as const,
  orgScope: { mode: 'FLAT_TENANT' as const },
  spatialScope,
});
const agriculture = SHIPPED_INDUSTRY_PACKS.find((pack) => pack.slug === 'agriculture')!;
const application = (placeTypes = agriculture.modules.geospatial!.lists!.placeTypes, checksum = `sha256:${'b'.repeat(64)}`) => ({
  kind: 'INDUSTRY',
  key: 'agriculture',
  version: '1.0',
  checksum,
  publishedVersionId: '00000000-0000-4000-8000-0000000000e1',
  section: { lists: { placeTypes } },
});

// WI-OI-107 on PostgreSQL with the real migrations and the non-superuser runtime role (RLS forced).
integration('Geospatial applies its section of an activated industry pack', () => {
  let db: GeospatialDatabaseService;
  let packs: GeospatialPackService;
  const types = async () =>
    db.withTenantTransaction(TENANT, async (client) =>
      (await client.query<{ code: string; label: string }>('SELECT code, label FROM gigalibs_geospatial.spatial_node_types ORDER BY code')).rows,
    );

  beforeAll(async () => {
    db = new GeospatialDatabaseService({ databaseUrl, databasePoolSize: 2, expectedMigrationVersion: 8 } as never);
    await db.onModuleInit();
    const places = new PlacesService(db);
    packs = new GeospatialPackService(db, places);
    // The tenant already has a FARM type under its own label, which a pack never renames.
    await places.createNodeType({ principal: principal(), correlationId: 'seed' }, { code: 'FARM', label: 'Holding' });
  });
  afterAll(async () => {
    await db?.onModuleDestroy();
  });

  it('adds the pack place types the tenant lacks, keeps existing ones, and holds the section', async () => {
    expect(await packs.apply({ principal: principal(), correlationId: 'pack:1' }, application())).toMatchObject({ status: 'APPLIED', createdPlaceTypes: ['FIELD', 'BLOCK'] });
    expect(await types()).toEqual([{ code: 'BLOCK', label: 'Block' }, { code: 'FARM', label: 'Holding' }, { code: 'FIELD', label: 'Field' }]);
    expect(await packs.apply({ principal: principal(), correlationId: 'pack:2' }, application())).toMatchObject({ createdPlaceTypes: [] });
    const held = await packs.current(principal());
    expect(held.items).toEqual([expect.objectContaining({ kind: 'INDUSTRY', key: 'agriculture', version: '1.0', section: { lists: { placeTypes: agriculture.modules.geospatial!.lists!.placeTypes } } })]);
    const audit = await db.withTenantTransaction(TENANT, async (client) =>
      (await client.query<{ n: number }>("SELECT count(*)::int AS n FROM gigalibs_geospatial.audit_events WHERE action = 'SPATIAL_PACK_APPLIED'")).rows[0]!.n,
    );
    expect(audit).toBe(2);
  });

  it('refuses members with a place scope, country packs and sections that are not Geospatial', async () => {
    await expect(packs.apply({ principal: principal({ mode: 'SCOPED_PLACES', placeIds: [] }), correlationId: 'x' }, application([{ code: 'ROW', label: 'Row' }]))).rejects.toBeInstanceOf(ForbiddenException);
    expect((await types()).map((type) => type.code)).not.toContain('ROW');
    await expect(packs.apply({ principal: principal(), correlationId: 'x' }, { ...application(), kind: 'COUNTRY', key: 'IN' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(packs.apply({ principal: principal(), correlationId: 'x' }, { ...application(), section: { vocabulary: {} } })).rejects.toBeInstanceOf(BadRequestException);
  });
});
