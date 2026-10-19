/**
 * Table 1 minimal P2P (iDempiere row 6): req → approve → PO → issue → ack → receipt match → vendor bill → approve.
 * Defer GL/AP posting to Table 2. Run: pnpm proof:minimal-p2p (from this package).
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { OrganizationReplica, type ModulePrincipal, type ReplicaUnit } from '@gigalibs/module-sdk';
import pg from 'pg';
import { DatabaseService } from '../src/database.service.js';
import { ProcurementService } from '../src/procurement/procurement.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (message: string) => console.log(`== ${message}`);
const versionId = 'procurement-minimal-p2p-v1';
const units: ReplicaUnit[] = [
  {
    unit_id: 'unit-procurement-1',
    parent_unit_id: null,
    code: 'UNIT-PROC-1',
    name: 'Corporate Procurement Unit',
    sort_order: 0,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
];
const checksum = `sha256:${createHash('sha256')
  .update(units.map((unit) => `${unit.unit_id}>${unit.parent_unit_id ?? ''}#${unit.sort_order}`).join('\n'))
  .digest('hex')}`;
const header = { tree_id: 'tree-procurement', tree_kind: 'PRIMARY' as const, version_number: 1, checksum };

const tenant = (tenantId: string, subject: string): ModulePrincipal => ({
  tenantId,
  subject,
  sessionId: `session-${subject}`,
  authVersion: 1,
  permissions: ['*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  organization: { mode: 'TENANT', tree_version: versionId },
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
});

step('Starting throwaway PostgreSQL for minimal P2P flow...');
const postgres = await startThrowawayPostgres(`gigalibs-min-p2p-${process.pid}`);
const db = new DatabaseService({
  databaseUrl: postgres.runtimeUrl,
  databasePoolSize: 5,
  expectedMigrationVersion: 4,
  platformContextAudience: 'proof',
  platformContextPublicKey: 'proof',
  corsOrigins: [],
  apiHost: '127.0.0.1',
  apiPort: 0,
} as never);

try {
  await db.onModuleInit();
  const replica = new OrganizationReplica('gigalibs_procurement');
  await db.withTenantTransaction('tenant-alpha', async (client) => {
    await replica.receivePage(client, 'tenant-alpha', versionId, header, units);
    await replica.complete(client, 'tenant-alpha', versionId, header, units.length);
  });

  const procurement = new ProcurementService(db);
  const principal = tenant('tenant-alpha', 'usr-buyer');
  const vendorPartyId = randomUUID();
  const productId = randomUUID();
  const uomId = randomUUID();
  const warehouseId = randomUUID();

  const admin = new pg.Client({ connectionString: postgres.adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO public.parties (id, tenant_id, code, legal_name, display_name, party_type, status)
       VALUES ($1, $2, 'VEND-MIN-P2P', 'Minimal P2P Vendor Ltd', 'Minimal P2P Vendor Ltd', 'ORGANIZATION', 'ACTIVE')`,
      [vendorPartyId, 'tenant-alpha'],
    );
  } finally {
    await admin.end();
  }

  step('Requisition draft → submit → approve');
  const requisition = await procurement.createRequisition(principal, {
    orgUnitId: 'unit-procurement-1',
    description: 'Minimal P2P bearings',
    currencyCode: 'USD',
    lines: [
      {
        productId,
        productCode: 'BEAR-6205',
        productName: 'Ball Bearing 6205',
        quantity: '10.000000',
        uomId,
        estimatedUnitPriceMinor: '1200',
      },
    ],
  });
  await procurement.submitRequisition(principal, requisition.id);
  const approved = await procurement.approveRequisition(principal, requisition.id);
  assert.equal(approved.status, 'APPROVED');

  step('Convert approved requisition to draft PO');
  const po = await procurement.convertRequisitionToPurchaseOrder(principal, approved.id, {
    vendorPartyId,
    vendorName: 'Minimal P2P Vendor Ltd',
    destinationWarehouseId: warehouseId,
  });
  assert.equal(po.status, 'DRAFT');
  assert.equal(po.requisitionId, approved.id);
  const convertedReq = await procurement.getRequisition(principal, approved.id);
  assert.equal(convertedReq.status, 'CONVERTED');

  step('Issue and acknowledge PO');
  const issued = await procurement.issuePurchaseOrder(principal, po.id);
  assert.equal(issued.status, 'ISSUED');
  const ack = await procurement.acknowledgePurchaseOrder(principal, po.id);
  assert.equal(ack.status, 'ACKNOWLEDGED');

  step('Match receipt and create vendor bill at PO price');
  const receiptId = randomUUID();
  const receiptLineId = randomUUID();
  const poLineId = ack.lines![0]!.id;
  await procurement.matchReceipt(principal, {
    purchaseOrderId: ack.id,
    purchaseOrderLineId: poLineId,
    receiptId,
    receiptLineId,
    matchedQuantity: '10.000000',
    uomId,
  });

  const bill = await procurement.createVendorBill(principal, {
    vendorPartyId,
    vendorInvoiceNumber: 'VINV-MIN-P2P-1',
    invoiceDate: '2026-10-04T00:00:00Z',
    dueDate: '2026-11-04T00:00:00Z',
    currencyCode: 'USD',
    purchaseOrderId: ack.id,
    lines: [
      {
        purchaseOrderId: ack.id,
        purchaseOrderLineId: poLineId,
        productId,
        description: 'Ball Bearing 6205',
        billedQuantity: '10.000000',
        uomId,
        unitPriceMinor: '1200',
        matchedReceiptLineId: receiptLineId,
      },
    ],
  });
  await procurement.matchInvoice(principal, {
    purchaseOrderId: ack.id,
    purchaseOrderLineId: poLineId,
    vendorBillId: bill.id,
    vendorBillLineId: bill.lines![0]!.id,
    receiptLineId,
    matchedQuantity: '10.000000',
  });

  const approvedBill = await procurement.approveVendorBill(principal, bill.id);
  assert.equal(approvedBill.status, 'APPROVED');

  step('MINIMAL P2P BUSINESS FLOW PASSED');
} finally {
  await db.onModuleDestroy().catch(() => {});
  postgres.stop();
}
