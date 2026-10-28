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
  const northFulfillment = randomUUID();
  const southFulfillment = randomUUID();
  const northInvoice = randomUUID();
  const southInvoice = randomUUID();
  const northMemo = randomUUID();
  const southMemo = randomUUID();

  beforeAll(async () => {
    pg = await startThrowawayPostgres(`gigalibs-orders-scope-${process.pid}`);
    db = new DatabaseService({
      databaseUrl: pg.runtimeUrl,
      databasePoolSize: 5,
      expectedMigrationVersion: 5,
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
      // A fulfillment per order — these carry no unit, so scope follows the parent order.
      for (const [id, order, number] of [
        [northFulfillment, northOrder, 'FO-N'],
        [southFulfillment, southOrder, 'FO-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.fulfillment_orders (id, tenant_id, fulfillment_number, order_id, warehouse_id, status)
           VALUES ($1, $2, $3, $4, $5, 'DRAFT')`,
          [id, tenantId, number, order, randomUUID()],
        );
      }
      // An invoice and a credit memo per order — both inherit the parent order's unit.
      for (const [id, order, number] of [
        [northInvoice, northOrder, 'INV-N'],
        [southInvoice, southOrder, 'INV-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.customer_invoices (id, tenant_id, invoice_number, order_id, customer_party_id, customer_name, due_date, issued_by)
           VALUES ($1, $2, $3, $4, $5, 'Acme', NOW(), 'admin')`,
          [id, tenantId, number, order, randomUUID()],
        );
      }
      for (const [id, order, number] of [
        [northMemo, northOrder, 'CM-N'],
        [southMemo, southOrder, 'CM-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.customer_credit_memos (id, tenant_id, credit_memo_number, order_id, customer_party_id, reason, issued_by)
           VALUES ($1, $2, $3, $4, $5, 'proof', 'admin')`,
          [id, tenantId, number, order, randomUUID()],
        );
      }
    });
    service = new OrderService(
      db,
      { check: async () => ({ decision: 'APPROVED' }) } as never,
      { check: async () => ({ decision: 'AVAILABLE', onHandQuantity: '0', reservedQuantity: '0', availableQuantity: '0' }) } as never,
    );
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

  it('downstream documents follow the parent order: a north member sees only north fulfillments', async () => {
    expect(
      (await service.listFulfillmentOrders(tenantWide)).map((f) => f.fulfillmentNumber).sort(),
    ).toEqual(['FO-N', 'FO-S']);
    expect((await service.listFulfillmentOrders(north)).map((f) => f.fulfillmentNumber)).toEqual([
      'FO-N',
    ]);
    await expect(service.getFulfillment(north, southFulfillment)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getFulfillment(north, northFulfillment)).resolves.toMatchObject({
      fulfillmentNumber: 'FO-N',
    });
  });

  it('invoices and credit memos follow the parent order too', async () => {
    expect((await service.listCustomerInvoices(north)).map((i) => i.invoiceNumber)).toEqual([
      'INV-N',
    ]);
    await expect(service.getCustomerInvoice(north, southInvoice)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getCustomerInvoice(north, northInvoice)).resolves.toMatchObject({
      invoiceNumber: 'INV-N',
    });

    expect((await service.listCustomerCreditMemos(north)).map((m) => m.creditMemoNumber)).toEqual([
      'CM-N',
    ]);
    await expect(service.getCustomerCreditMemo(north, southMemo)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getCustomerCreditMemo(north, northMemo)).resolves.toMatchObject({
      creditMemoNumber: 'CM-N',
    });
  });
});
