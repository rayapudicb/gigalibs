/**
 * WI-OI-120p slice 9 (R14, scope in every module): a department-A member can neither read nor change department-B's
 * procurement requisitions or purchase orders. Runs against a throwaway PostgreSQL that the harness starts and
 * removes; it needs Docker, so it is skipped unless PROCUREMENT_SCOPE_IT is set.
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
import { ProcurementService } from './procurement.service.js';

const integration = describe.skipIf(!process.env.PROCUREMENT_SCOPE_IT);

const versionId = 'scope-it-version-1';
const units: ReplicaUnit[] = [
  {
    unit_id: 'north',
    parent_unit_id: null,
    code: 'NORTH',
    name: 'North plant',
    sort_order: 0,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
  {
    unit_id: 'south',
    parent_unit_id: null,
    code: 'SOUTH',
    name: 'South plant',
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
const header = { tree_id: 'tree-proc', tree_kind: 'PRIMARY' as const, version_number: 1, checksum };

const tenantId = 'tenant-scope';
const base = (subject: string, organization: ModulePrincipal['organization']): ModulePrincipal => ({
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
const tenantWide = base('admin', { mode: 'TENANT', tree_version: versionId });
const northMember = base('north-user', {
  mode: 'UNITS',
  tree_version: versionId,
  read_roots: ['north'],
  write_roots: ['north'],
});

integration('Procurement organization scope (isolated PostgreSQL)', () => {
  let pg: ThrowawayPostgres;
  let db: DatabaseService;
  let service: ProcurementService;
  const northReq = randomUUID();
  const southReq = randomUUID();
  const northPo = randomUUID();
  const southPo = randomUUID();
  const northBill = randomUUID();
  const southBill = randomUUID();
  const northPolicy = randomUUID();
  const southPolicy = randomUUID();

  beforeAll(async () => {
    pg = await startThrowawayPostgres(`gigalibs-proc-scope-${process.pid}`);
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
      // Two requisitions, one owned by each plant.
      for (const [id, unit, number] of [
        [northReq, 'north', 'REQ-N'],
        [southReq, 'south', 'REQ-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.procurement_requisitions (id, tenant_id, requisition_number, org_unit_id, requested_by, status)
           VALUES ($1, $2, $3, $4, 'admin', 'DRAFT')`,
          [id, tenantId, number, unit],
        );
      }
      // Two purchase orders, one owned by each plant.
      for (const [id, unit, number] of [
        [northPo, 'north', 'PO-N'],
        [southPo, 'south', 'PO-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.purchase_orders (id, tenant_id, order_number, org_unit_id, vendor_party_id, vendor_name, destination_warehouse_id, status)
           VALUES ($1, $2, $3, $4, $5, 'Acme', $6, 'DRAFT')`,
          [id, tenantId, number, unit, randomUUID(), randomUUID()],
        );
      }
      // A vendor bill per PO — bills carry no unit, so scope follows the parent purchase order.
      for (const [id, po, number] of [
        [northBill, northPo, 'VB-N'],
        [southBill, southPo, 'VB-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.vendor_bills (id, tenant_id, vendor_party_id, vendor_invoice_number, invoice_date, due_date, subtotal_minor, total_amount_minor, purchase_order_id)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), 0, 0, $5)`,
          [id, tenantId, randomUUID(), number, po],
        );
      }
      // An approval policy per plant (these carry a unit directly).
      for (const [id, unit, name] of [
        [northPolicy, 'north', 'POL-N'],
        [southPolicy, 'south', 'POL-S'],
      ] as const) {
        await client.query(
          `INSERT INTO ${SCHEMA}.procurement_approval_policies (id, tenant_id, policy_name, org_unit_id, max_amount_minor, required_role)
           VALUES ($1, $2, $3, $4, 100000, 'procurement:orders:approve')`,
          [id, tenantId, name, unit],
        );
      }
    });
    service = new ProcurementService(db);
  }, 60_000);

  afterAll(async () => {
    await db?.onModuleDestroy?.();
    pg?.stop();
  });

  it('tenant-wide authority sees both plants; a north member sees only north', async () => {
    const all = await service.listRequisitions(tenantWide);
    expect(all.map((r) => r.requisitionNumber).sort()).toEqual(['REQ-N', 'REQ-S']);

    const northList = await service.listRequisitions(northMember);
    expect(northList.map((r) => r.requisitionNumber)).toEqual(['REQ-N']);
  });

  it('a north member cannot read south by id (invisible → not found), but can read north', async () => {
    await expect(service.getRequisition(northMember, southReq)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getRequisition(northMember, northReq)).resolves.toMatchObject({
      requisitionNumber: 'REQ-N',
    });
  });

  it('a north member cannot change south (not found), but can submit north', async () => {
    await expect(service.approveRequisition(northMember, southReq)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.submitRequisition(northMember, northReq)).resolves.toMatchObject({
      status: 'PENDING_APPROVAL',
    });
  });

  it('purchase orders are scoped too: a north member lists/reads/issues only north', async () => {
    expect((await service.listPurchaseOrders(tenantWide)).map((p) => p.orderNumber).sort()).toEqual(
      ['PO-N', 'PO-S'],
    );
    expect((await service.listPurchaseOrders(northMember)).map((p) => p.orderNumber)).toEqual([
      'PO-N',
    ]);
    await expect(service.getPurchaseOrder(northMember, southPo)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.issuePurchaseOrder(northMember, southPo)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.issuePurchaseOrder(northMember, northPo)).resolves.toMatchObject({
      status: 'ISSUED',
    });
  });

  it('vendor bills follow their purchase order: a north member lists/reads only north', async () => {
    expect((await service.listVendorBills(northMember)).map((b) => b.vendorInvoiceNumber)).toEqual([
      'VB-N',
    ]);
    await expect(service.getVendorBill(northMember, southBill)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.getVendorBill(northMember, northBill)).resolves.toMatchObject({
      vendorInvoiceNumber: 'VB-N',
    });
  });

  it('approval policies (which carry a unit directly) list only the member units', async () => {
    expect(
      (await service.listApprovalPolicies(tenantWide)).map((p) => p.policyName).sort(),
    ).toEqual(['POL-N', 'POL-S']);
    expect((await service.listApprovalPolicies(northMember)).map((p) => p.policyName)).toEqual([
      'POL-N',
    ]);
  });
});
