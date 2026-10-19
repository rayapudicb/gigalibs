/**
 * Table 1 minimal O2C (iDempiere row 7): quote → accept → SO → confirm → allocate → ship → customer invoice.
 * Skips inventory dispatch proof (issueId); defers AR module compose to M-AR0.
 * Run: pnpm proof:minimal-o2c (from this package).
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { OrganizationReplica, type ModulePrincipal, type ReplicaUnit } from '@gigalibs/module-sdk';
import pg from 'pg';
import { DatabaseService } from '../src/database.service.js';
import { OrderService } from '../src/orders/orders.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (message: string) => console.log(`== ${message}`);
const versionId = 'orders-minimal-o2c-v1';
const units: ReplicaUnit[] = [
  {
    unit_id: 'unit-sales-1',
    parent_unit_id: null,
    code: 'UNIT-SALES-1',
    name: 'Corporate Sales Unit',
    sort_order: 0,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
];
const checksum = `sha256:${createHash('sha256')
  .update(units.map((unit) => `${unit.unit_id}>${unit.parent_unit_id ?? ''}#${unit.sort_order}`).join('\n'))
  .digest('hex')}`;
const header = { tree_id: 'tree-orders', tree_kind: 'PRIMARY' as const, version_number: 1, checksum };

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

step('Starting throwaway PostgreSQL for minimal O2C flow...');
const postgres = await startThrowawayPostgres(`gigalibs-min-o2c-${process.pid}`);
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
  const replica = new OrganizationReplica('gigalibs_orders');
  await db.withTenantTransaction('tenant-alpha', async (client) => {
    await replica.receivePage(client, 'tenant-alpha', versionId, header, units);
    await replica.complete(client, 'tenant-alpha', versionId, header, units.length);
  });

  const orders = new OrderService(db);
  const tenantId = 'tenant-alpha';
  const subject = 'usr-sales';
  const customerPartyId = randomUUID();
  const productId = randomUUID();
  const uomId = randomUUID();
  const warehouseId = randomUUID();

  const admin = new pg.Client({ connectionString: postgres.adminUrl });
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO public.parties (id, tenant_id, code, legal_name, display_name, party_type, status)
       VALUES ($1, $2, 'CUST-MIN-O2C', 'Minimal O2C Customer Inc', 'Minimal O2C Customer Inc', 'ORGANIZATION', 'ACTIVE')`,
      [customerPartyId, tenantId],
    );
  } finally {
    await admin.end();
  }

  step('Quote → accept → convert to sales order');
  const quote = await orders.createQuote(tenantId, subject, {
    orgUnitId: 'unit-sales-1',
    customerPartyId,
    customerName: 'Minimal O2C Customer Inc',
    currencyCode: 'USD',
    validUntil: '2026-12-31T00:00:00Z',
    paymentTermDays: 30,
    lines: [
      {
        productId,
        productCode: 'SKU-MIN',
        productName: 'Minimal SKU',
        quotedQuantity: '5.000000',
        uomId,
        unitPriceMinor: '1000',
        discountPercentBasisPoints: 0,
        taxRateBasisPoints: 0,
      },
    ],
  });
  await orders.acceptQuote(tenantId, subject, quote.id);
  const salesOrder = await orders.convertQuoteToOrder(tenantId, subject, quote.id, warehouseId);
  assert.equal(salesOrder.status, 'DRAFT');

  step('Confirm order, allocate, fulfill (shipped qty)');
  const confirmed = await orders.confirmOrder(tenantId, subject, salesOrder.id);
  assert.equal(confirmed.status, 'CONFIRMED');
  const orderLineId = confirmed.lines![0]!.id;

  await orders.allocateOrderLine(tenantId, subject, {
    orderId: confirmed.id,
    orderLineId,
    warehouseId,
    allocatedQuantity: '5.000000',
  });

  await orders.createFulfillment(tenantId, subject, {
    orderId: confirmed.id,
    warehouseId,
    lines: [{ orderLineId, shippedQuantity: '5.000000' }],
  });

  step('Issue customer invoice for shipped quantity');
  const invoice = await orders.createCustomerInvoice(tenantId, subject, {
    orderId: confirmed.id,
    dueDate: '2026-11-15T00:00:00Z',
  });
  assert.equal(invoice.status, 'ISSUED');
  assert.equal(invoice.lines![0]!.invoicedQuantity, '5.000000');

  step('MINIMAL O2C BUSINESS FLOW PASSED');
} finally {
  await db.onModuleDestroy().catch(() => {});
  postgres.stop();
}
