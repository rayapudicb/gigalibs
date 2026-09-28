import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeospatialDatabaseService } from '../database/database.service.js';
import { PlacesService } from './places.service.js';

const principal = {
  tenantId: 'tenant-a',
  subject: 'user-a',
  sessionId: 'session-a',
  authVersion: 1,
  permissions: ['maps:*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN' as const,
  orgScope: { mode: 'FLAT_TENANT' as const },
  spatialScope: { mode: 'UNBOUNDED' as const },
};
const context = { principal, correlationId: 'corr-1' };
const TYPE_ID = '00000000-0000-4000-8000-0000000000a1';
const NODE_ID = '00000000-0000-4000-8000-000000000001';
const PARENT_ID = '00000000-0000-4000-8000-000000000002';
const timestamps = { created_at: new Date('2026-09-26T00:00:00Z'), updated_at: new Date('2026-09-26T00:00:00Z') };

function lockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NODE_ID,
    parent_id: null,
    code: 'APAC',
    path: 'APAC',
    depth: 1,
    status: 'ACTIVE',
    version: 1,
    country_code: null,
    subdivision_code: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

describe('PlacesService', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let database: { withTenantTransaction: ReturnType<typeof vi.fn> };
  let service: PlacesService;

  beforeEach(() => {
    client = { query: vi.fn() };
    database = {
      withTenantTransaction: vi.fn(async (tenantId: string, callback: (value: unknown) => unknown) => {
        expect(tenantId).toBe('tenant-a');
        return callback(client);
      }),
    };
    service = new PlacesService(database as unknown as GeospatialDatabaseService);
  });

  it('lists places inside the tenant transaction and reports the tenant node count for flat mode', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: NODE_ID, parent_id: null, node_type_id: TYPE_ID, node_type_code: 'SITE', code: 'STORE_1',
          path: 'STORE_1', depth: 1, display_name: 'Store 1', country_code: 'IN', subdivision_code: null,
          time_zone: 'Asia/Kolkata', latitude: '12.97', longitude: '77.59', boundary: null, child_count: 0,
          status: 'ACTIVE', version: 1, total_count: 1, ...timestamps,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    await expect(service.listNodes(principal, { roots: 'true' })).resolves.toMatchObject({
      total: 1,
      tenantNodeCount: 1,
      items: [{ code: 'STORE_1', latitude: 12.97, hasBoundary: false }],
    });
    expect(client.query.mock.calls[0]![0]).toContain('n.parent_id IS NULL');
    expect(client.query.mock.calls[0]![1][0]).toBe('tenant-a');
  });

  it('rejects invalid input before opening a transaction', async () => {
    await expect(
      service.createNode(context, { code: 'bad code', displayName: 'X', nodeTypeId: TYPE_ID }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createNode(context, { code: 'OK', displayName: 'X', nodeTypeId: TYPE_ID, latitude: 10 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createNode(context, {
        code: 'OK', displayName: 'X', nodeTypeId: TYPE_ID, countryCode: 'GB', subdivisionCode: 'IN-KA',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(database.withTenantTransaction).not.toHaveBeenCalled();
  });

  it('refuses to add a place under an inactive parent', async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: TYPE_ID, code: 'SITE' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [lockRow({ id: PARENT_ID, status: 'INACTIVE' })] });
    await expect(
      service.createNode(context, { code: 'STORE_1', displayName: 'Store 1', nodeTypeId: TYPE_ID, parentId: PARENT_ID }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns 404 for an unknown or inactive node type', async () => {
    client.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(
      service.createNode(context, { code: 'STORE_1', displayName: 'Store 1', nodeTypeId: TYPE_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a stale expected version', async () => {
    client.query.mockResolvedValueOnce({ rowCount: 1, rows: [lockRow({ version: 2 })] });
    await expect(
      service.updateNode(context, NODE_ID, { expectedVersion: 1, displayName: 'Renamed' }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to deactivate a place that still has active places under it', async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [lockRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ '?column?': 1 }] });
    await expect(
      service.updateNode(context, NODE_ID, { expectedVersion: 1, status: 'INACTIVE' }),
    ).rejects.toMatchObject({ response: { code: 'SPATIAL_ACTIVE_DESCENDANTS' } });
  });

  it('refuses to move a place under itself or one of its descendants', async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [lockRow()] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [lockRow({ id: PARENT_ID, path: 'APAC.BLR', depth: 2, parent_id: NODE_ID })] })
      .mockResolvedValueOnce({ rows: [{ inside: true }] });
    await expect(
      service.moveNode(context, NODE_ID, { expectedVersion: 1, newParentId: PARENT_ID }),
    ).rejects.toMatchObject({ response: { code: 'SPATIAL_MOVE_CYCLE' } });
  });

  it('writes a node type, its audit record and its outbox fact in the same transaction', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [{ id: TYPE_ID, code: 'SITE', label: 'Site', status: 'ACTIVE', version: 1, node_count: 0, ...timestamps }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(service.createNodeType(context, { code: 'site', label: 'Site' })).resolves.toMatchObject({
      code: 'SITE',
      nodeCount: 0,
    });
    expect(database.withTenantTransaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[1]![0]).toContain('audit_events');
    expect(client.query.mock.calls[2]![0]).toContain('outbox_events');
    expect(client.query.mock.calls[2]![1]).toContain('SpatialNodeTypeCreatedV1');
  });

  it('translates a duplicate code into a conflict', async () => {
    client.query.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(service.createNodeType(context, { code: 'SITE', label: 'Site' })).rejects.toThrow(ConflictException);
  });
});

// WI-OI-063b spatial scope: scoped principals reach only their assigned places and everything inside them.
describe('PlacesService spatial scope', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let database: { withTenantTransaction: ReturnType<typeof vi.fn> };
  let service: PlacesService;
  const scoped = {
    ...principal,
    permissions: ['maps.nodes.read', 'maps.nodes.manage'],
    roles: ['MEMBER'],
    persona: 'WORKFORCE_MEMBER' as const,
    spatialScope: { mode: 'SCOPED_PLACES' as const, place_ids: [NODE_ID] },
  };
  const scopedContext = { principal: scoped, correlationId: 'corr-2' };
  const roots = { rows: [{ path: 'APAC.BLR_01' }] };

  beforeEach(() => {
    client = { query: vi.fn() };
    database = { withTenantTransaction: vi.fn(async (_tenantId: string, callback: (value: unknown) => unknown) => callback(client)) };
    service = new PlacesService(database as unknown as GeospatialDatabaseService);
  });

  it('resolves the assigned places to their current paths and limits the list and count to them', async () => {
    client.query.mockResolvedValueOnce(roots).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });
    await expect(service.listNodes(scoped, {})).resolves.toMatchObject({ tenantNodeCount: 0, items: [] });
    expect(client.query.mock.calls[0]![0]).toContain('id = ANY($2::uuid[])');
    expect(client.query.mock.calls[0]![1]).toEqual(['tenant-a', [NODE_ID]]);
    expect(client.query.mock.calls[1]![0]).toContain('n.path <@ ANY($2::ltree[])');
    expect(client.query.mock.calls[1]![1][1]).toEqual(['APAC.BLR_01']);
    expect(client.query.mock.calls[2]![0]).toContain('path <@ ANY($2::ltree[])');
  });

  it('fails closed for a member with no assigned places', async () => {
    const unassigned = { ...scoped, spatialScope: { mode: 'SCOPED_PLACES' as const, place_ids: [] } };
    client.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: 0 }] });
    await service.listNodes(unassigned, {});
    expect(client.query.mock.calls[0]![0]).toContain('n.path <@ ANY($2::ltree[])');
    expect(client.query.mock.calls[0]![1][1]).toEqual([]);
  });

  it('reports a place outside the scope exactly like a missing one', async () => {
    client.query.mockResolvedValueOnce(roots).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.getNode(scoped, PARENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(client.query.mock.calls[1]![0]).toContain('n.path <@ ANY($3::ltree[])');
  });

  it('refuses a parent outside the scope as not found', async () => {
    client.query.mockResolvedValueOnce(roots).mockResolvedValueOnce({ rows: [{ id: TYPE_ID, code: 'SITE' }], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(service.createNode(scopedContext, { code: 'X', displayName: 'X', nodeTypeId: TYPE_ID, parentId: PARENT_ID }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(client.query.mock.calls[2]![0]).toContain('path <@ ANY($3::ltree[])');
  });

  it('denies adding a top-level place before touching the catalogue', async () => {
    client.query.mockResolvedValueOnce(roots);
    await expect(service.createNode(scopedContext, { code: 'X', displayName: 'X', nodeTypeId: TYPE_ID }))
      .rejects.toMatchObject({ response: { code: 'SPATIAL_SCOPE_DENIED' } });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('denies moving a place to the top level', async () => {
    client.query.mockResolvedValueOnce(roots).mockResolvedValueOnce({ rowCount: 1, rows: [lockRow({ path: 'APAC.BLR_01', parent_id: PARENT_ID })] });
    await expect(service.moveNode(scopedContext, NODE_ID, { expectedVersion: 1, newParentId: null }))
      .rejects.toMatchObject({ response: { code: 'SPATIAL_SCOPE_DENIED' } });
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('denies managing the shared place-type catalogue without opening a transaction', async () => {
    await expect(service.createNodeType(scopedContext, { code: 'SITE', label: 'Site' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.withTenantTransaction).not.toHaveBeenCalled();
  });
});

// WI-OI-063c bulk import: validate by row, then all-or-nothing creation parents-first.
describe('PlacesService bulk import', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let database: { withTenantTransaction: ReturnType<typeof vi.fn> };
  let service: PlacesService;
  const REGION_TYPE = '00000000-0000-4000-8000-0000000000b1';
  const SITE_TYPE = '00000000-0000-4000-8000-0000000000b2';
  const types = { rows: [{ id: REGION_TYPE, code: 'REGION' }, { id: SITE_TYPE, code: 'SITE' }] };
  const writes = () => client.query.mock.calls.filter(([sql]) => /INSERT INTO/.test(String(sql)));

  beforeEach(() => {
    client = { query: vi.fn() };
    database = { withTenantTransaction: vi.fn(async (_tenantId: string, callback: (value: unknown) => unknown) => callback(client)) };
    service = new PlacesService(database as unknown as GeospatialDatabaseService);
  });

  it('reports every problem by row and writes nothing when validating', async () => {
    client.query
      .mockResolvedValueOnce(types)
      .mockResolvedValueOnce({ rows: [{ id: NODE_ID, path: 'EMEA', status: 'ACTIVE' }, { id: PARENT_ID, path: 'OLD', status: 'INACTIVE' }] });
    const result = await service.importNodes(context, {
      mode: 'VALIDATE',
      rows: [
        { code: 'APAC', displayName: 'Asia Pacific', nodeTypeCode: 'region' },
        { code: 'APAC', displayName: 'Duplicate', nodeTypeCode: 'REGION' },
        { code: 'EMEA', displayName: 'Exists', nodeTypeCode: 'REGION' },
        { code: 'LON', displayName: 'London', nodeTypeCode: 'DEPOT', parentPath: 'EMEA' },
        { code: 'X', displayName: 'Orphan', nodeTypeCode: 'SITE', parentPath: 'NOWHERE' },
        { code: 'Y', displayName: 'Under inactive', nodeTypeCode: 'SITE', parentPath: 'OLD' },
        { code: 'bad code', displayName: 'Bad', nodeTypeCode: 'SITE' },
      ],
    });
    expect(result).toMatchObject({ mode: 'VALIDATE', rowCount: 7, valid: false, created: 0 });
    expect(result.errors.map((error) => [error.row, error.field])).toEqual([
      [2, 'code'],
      [3, 'code'],
      [4, 'nodeTypeCode'],
      [5, 'parentPath'],
      [6, 'parentPath'],
      [7, 'code'],
    ]);
    expect(writes()).toHaveLength(0);
  });

  it('refuses to commit an invalid file without writing anything', async () => {
    client.query.mockResolvedValueOnce(types).mockResolvedValueOnce({ rows: [] });
    await expect(service.importNodes(context, {
      mode: 'COMMIT',
      rows: [{ code: 'X', displayName: 'Orphan', nodeTypeCode: 'SITE', parentPath: 'NOWHERE' }],
    })).rejects.toMatchObject({ response: { code: 'SPATIAL_IMPORT_INVALID', result: { valid: false } } });
    expect(writes()).toHaveLength(0);
  });

  it('creates parents before children and records audit and change events for every place', async () => {
    client.query
      .mockResolvedValueOnce(types)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: NODE_ID, path: 'APAC' }] })
      .mockResolvedValueOnce({ rows: [{ id: PARENT_ID, path: 'APAC.BLR_01' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await service.importNodes(context, {
      mode: 'COMMIT',
      rows: [
        { code: 'BLR_01', displayName: 'Bengaluru 01', nodeTypeCode: 'SITE', parentPath: 'APAC', countryCode: 'IN', subdivisionCode: 'IN-KA', timeZone: 'Asia/Kolkata', latitude: 12.97, longitude: 77.59 },
        { code: 'APAC', displayName: 'Asia Pacific', nodeTypeCode: 'REGION' },
      ],
    });
    expect(result).toEqual({ mode: 'COMMIT', rowCount: 2, valid: true, created: 2, errors: [] });
    const [regionInsert, siteInsert, audit, outbox] = writes();
    expect(JSON.parse(regionInsert![1][3])).toEqual([expect.objectContaining({ path: 'APAC', parent_id: null, node_type_id: REGION_TYPE })]);
    expect(JSON.parse(siteInsert![1][3])).toEqual([expect.objectContaining({ path: 'APAC.BLR_01', parent_id: NODE_ID, subdivision_code: 'IN-KA' })]);
    const auditRows = JSON.parse(audit![1][3]) as { action: string }[];
    expect(auditRows.map((row) => row.action)).toEqual(['SPATIAL_NODE_CREATED', 'SPATIAL_NODE_CREATED', 'SPATIAL_NODES_IMPORTED']);
    const events = JSON.parse(outbox![1][2]) as { payload: { change: string; parentId: string | null } }[];
    expect(events.map((event) => [event.payload.change, event.payload.parentId])).toEqual([['CREATED', null], ['CREATED', NODE_ID]]);
  });

  it('denies bulk import to a spatially scoped principal without opening a transaction', async () => {
    const scoped = { ...principal, spatialScope: { mode: 'SCOPED_PLACES' as const, place_ids: [NODE_ID] } };
    await expect(service.importNodes({ principal: scoped, correlationId: 'corr-3' }, {
      mode: 'VALIDATE',
      rows: [{ code: 'X', displayName: 'X', nodeTypeCode: 'SITE' }],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.withTenantTransaction).not.toHaveBeenCalled();
  });

  it('performs mobileSync returning compact node summaries for mobile edge devices', async () => {
    client.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: NODE_ID,
            code: 'PLANT_1',
            display_name: 'Main Plant',
            path: 'PLANT_1',
            depth: 1,
            node_type_code: 'SITE',
            latitude: 12.97,
            longitude: 77.59,
            status: 'ACTIVE',
            version: 1,
            updated_at: new Date('2026-09-27T00:00:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await service.mobileSync(principal, { since: '2026-09-26T00:00:00Z' });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.code).toBe('PLANT_1');
    expect(result.tenantNodeCount).toBe(1);
    expect(result.serverTime).toBeDefined();
  });

  it('performs lookupTag finding a node by code or path for QR scanning', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: NODE_ID }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: NODE_ID,
            parent_id: null,
            node_type_id: REGION_TYPE,
            code: 'PUMP_01',
            path: 'PLANT_1.PUMP_01',
            depth: 2,
            display_name: 'Water Pump 01',
            status: 'ACTIVE',
            version: 1,
            boundary: null,
            child_count: 0,
            created_at: new Date(),
            updated_at: new Date(),
            node_type_code: 'MACHINE',
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.lookupTag(principal, 'PUMP_01');
    expect(result.id).toBe(NODE_ID);
    expect(result.code).toBe('PUMP_01');
  });
});

