/**
 * WI-OI-120p slice 9 (R14, scope in every module): a department-A member can neither read nor change department-B's
 * sales orders. Runs against a throwaway PostgreSQL the harness starts and removes; needs Docker, so it is skipped
 * unless ORDERS_SCOPE_IT is set.
 */
import { createHash, randomUUID } from 'node:crypto';
import { type ModulePrincipal, OrganizationReplica, type ReplicaUnit } from '@gigalibs/module-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ThrowawayPostgres,
  startThrowawayPostgres,
} from '../../scripts/throwaway-postgres.js';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { OrderService } from './orders.service.js';

const integration = describe.skipIf(!process.env.ORDERS_SCOPE_IT);

const versionId = 'orders-scope-version-1';
const units: ReplicaUnit[] = [
  {
    unit_id: 'north',
    parent_unit_id: null,
    code: 'NORTH',
    name: 'North sales',
    sort_order: 0,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
  {
    unit_id: 'south',
    parent_unit_id: null,
    code: 'SOUTH',
    name: 'South sales',
    sort_order: 1,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
];
const checksum = `sha256:${createHash('sha256')
  .update(
    units
      .toSorted((a, b) => a.unit_id.localeCompare(b.unit_id, 'en', { usage: 'sort' }))
      .map((u) => `${u.unit_id}>${u.parent_unit_id ?? ''}#${u.sort_order}`)
      .join('\n'),
  )
  .digest('hex')}`;
const header = {
  tree_id: 'tree-orders',
  tree_kind: 'PRIMARY' as const,
  version_number: 1,
  checksum,
};

const tenantId = 'tenant-scope';
const mk = (subject: string, organization: ModulePrincipal['organization']): ModulePrincipal => ({
  tenantId,
  subject,
  sessionId: `session-${subject}`,
  authVersion: 1,
  permissions: ['*'],
  roles: ['MEMBER'],
  persona: 'WORKFORCE_MEMBER',
  organization,
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
});
const tenantWide = mk('admin', { mode: 'TENANT', tree_version: versionId });
const north = mk('north-user', {
  mode: 'UNITS',
  tree_version: versionId,
  read_roots: ['north'],
  write_roots: ['north'],
});

integration('Orders organization scope (isolated PostgreSQL)', () => {
  let pg: ThrowawayPostgres;
  let db: DatabaseService;
  let service: OrderService;
  const northOrder = randomUUID();
  const southOrder = randomUUID();

  beforeAll(async () => {
    pg = await startThrowawayPostgres(`gigalibs-orders-scope-${process.pid}`);
    db = new DatabaseService({
      databaseUrl: pg.runtimeUrl,
      databasePoolSize: 5,
      expectedMigrationVersion: 4,
      platformContextAudience: 'proof',
      platformContextPublicKey: 'proof',
      corsOrigins: [],
      apiHost: '127.0.0.1',
      apiPort: 0,
    } as never);
    await db.onModuleInit();
    const replica = new OrganizationReplica(SCHEMA);
    await db.withTenantTransaction(tenantId, async (client) => {
      await replica.receivePage(client, tenantId, versionId, header, units);
      await replica.complete(client, tenantId, versionId, header, units.length);
      for (const [id, unit, number] of [
        [northOrder, 'north', 'SO-N'],
        [southOrder, 'south', 'SO-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.sales_orders (id, tenant_id, order_number, org_unit_id, customer_party_id, customer_name, warehouse_id, status)
           VALUES ($1, $2, $3, $4, $5, 'Acme', $6, 'DRAFT')`,
          [id, tenantId, number, unit, randomUUID(), randomUUID()],
        );
      }
    });
    service = new OrderService(db);
  }, 60_000);

  afterAll(async () => {
    await db?.onModuleDestroy?.();
    pg?.stop();
  });

  it('tenant-wide authority lists both plants; a north member lists only north', async () => {
    expect((await service.listSalesOrders(tenantWide)).map((o) => o.orderNumber).sort()).toEqual([
      'SO-N',
      'SO-S',
    ]);
    expect((await service.listSalesOrders(north)).map((o) => o.orderNumber)).toEqual(['SO-N']);
  });

  it('a north member cannot read south by id (not found), but can read north', async () => {
    await expect(service.getOrder(north, southOrder)).rejects.toMatchObject({ status: 404 });
    await expect(service.getOrder(north, northOrder)).resolves.toMatchObject({
      orderNumber: 'SO-N',
    });
  });

  it('a north member cannot confirm south (not found), but can confirm north', async () => {
    await expect(service.confirmOrder(north, southOrder)).rejects.toMatchObject({ status: 404 });
    await expect(service.confirmOrder(north, northOrder)).resolves.toMatchObject({
      status: 'CONFIRMED',
    });
  });
});
