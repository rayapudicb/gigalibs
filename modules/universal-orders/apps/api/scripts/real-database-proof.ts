import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  OrganizationReplica,
  type ModulePrincipal,
  type ReplicaUnit,
} from '@gigalibs/module-sdk';
import { validateDictionaryRules } from '@gigalibs/configuration-core';
import type { DictionaryValidationRuleV1 } from '@gigalibs/contracts';
import pg from 'pg';
import { DatabaseService } from '../src/database.service.js';
import { OrderService } from '../src/orders/orders.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (message: string) => console.log(`== ${message}`);
const versionId = 'orders-proof-version-1';
const units: ReplicaUnit[] = [
  {
    unit_id: 'unit-sales-1',
    parent_unit_id: null,
    code: 'UNIT-SALES-1',
    name: 'Corporate Commercial Sales Unit',
    sort_order: 0,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
  {
    unit_id: 'unit-sales-2',
    parent_unit_id: null,
    code: 'UNIT-SALES-2',
    name: 'Regional Fulfillment Distribution Hub',
    sort_order: 1,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
];
const checksum = `sha256:${createHash('sha256')
  .update(
    units
      .toSorted((left, right) => left.unit_id.localeCompare(right.unit_id, 'en', { usage: 'sort' }))
      .map((unit) => `${unit.unit_id}>${unit.parent_unit_id ?? ''}#${unit.sort_order}`)
      .join('\n'),
  )
  .digest('hex')}`;
const header = { tree_id: 'tree-orders', tree_kind: 'PRIMARY' as const, version_number: 1, checksum };

const principal = (
  tenantId: string,
  subject: string,
  organization: ModulePrincipal['organization'],
): ModulePrincipal => ({
  tenantId,
  subject,
  sessionId: `session-${subject}`,
  authVersion: 1,
  permissions: ['*'],
  roles: ['TENANT_ADMIN'],
  persona: 'TENANT_ADMIN',
  organization,
  departmentScope: { mode: 'ALL' },
  placeScope: { mode: 'ALL' },
});

const tenant = (tenantId: string, subject: string) =>
  principal(tenantId, subject, { mode: 'TENANT', tree_version: versionId });

step('Starting throwaway PostgreSQL container...');
const postgres = await startThrowawayPostgres(`gigalibs-orders-proof-${process.pid}`);
const db = new DatabaseService({
  databaseUrl: postgres.runtimeUrl,
  databasePoolSize: 5,
  expectedMigrationVersion: 2,
  platformContextAudience: 'proof',
  platformContextPublicKey: 'proof',
  corsOrigins: [],
  apiHost: '127.0.0.1',
  apiPort: 0,
} as never);

try {
  await db.onModuleInit();
  const replica = new OrganizationReplica('gigalibs_orders');
  for (const tenantId of ['tenant-alpha', 'tenant-beta']) {
    await db.withTenantTransaction(tenantId, async (client) => {
      await replica.receivePage(client, tenantId, versionId, header, units);
      await replica.complete(client, tenantId, versionId, header, units.length);
    });
  }

  const orderService = new OrderService(db);
  const tenantA = tenant('tenant-alpha', 'usr-sales-alpha');
  const tenantB = tenant('tenant-beta', 'usr-sales-beta');
  const customerPartyId = randomUUID();
  const productId = randomUUID();
  const uomId = randomUUID();
  const warehouseId = randomUUID();

  // ─── Scenario 1: Isolated Schema & Unrelated Table Integrity ────────────────
  step('1. Verifying schema isolation & migration integrity');
  const adminClient = new pg.Client({ connectionString: postgres.adminUrl });
  await adminClient.connect();
  try {
    const sentinelRes = await adminClient.query('SELECT value FROM public.unrelated_upgrade_sentinel WHERE id = 1');
    assert.equal(sentinelRes.rows[0].value, 'preserve-me');

    const tablesRes = await adminClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'gigalibs_orders'
    `);
    const tables = tablesRes.rows.map((r: { table_name: string }) => r.table_name);
    assert.ok(tables.includes('sales_quotes'), 'Missing sales_quotes table');
    assert.ok(tables.includes('sales_orders'), 'Missing sales_orders table');
    assert.ok(tables.includes('order_inventory_allocations'), 'Missing order_inventory_allocations table');
    assert.ok(tables.includes('fulfillment_orders'), 'Missing fulfillment_orders table');
    assert.ok(tables.includes('fulfillment_order_lines'), 'Missing fulfillment_order_lines table');
    assert.ok(tables.includes('customer_invoices'), 'Missing customer_invoices table');
    assert.ok(tables.includes('customer_credit_memos'), 'Missing customer_credit_memos table');
  } finally {
    await adminClient.end();
  }

  // ─── Scenario 2: Sales Quote Creation with Minor Units & Discounts ──────────
  step('2. Creating Sales Quote with exact minor-unit integer arithmetic and discount');
  // 100 units @ 1500 minor ($15.00) = 150,000 minor subtotal
  // Discount 500 basis points (5.0%) = 7,500 minor
  // Net subtotal = 142,500 minor
  // Tax 1000 basis points (10.0%) = 14,250 minor
  // Total = 156,750 minor ($1,567.50)
  const quote = await orderService.createQuote(tenantA.tenantId, tenantA.subject, {
    orgUnitId: 'unit-sales-1',
    customerPartyId,
    customerName: 'Acme Commercial Technologies Inc',
    currencyCode: 'USD',
    validUntil: '2026-11-30T00:00:00Z',
    paymentTermDays: 30,
    lines: [
      {
        productId,
        productCode: 'SERVO-DRIVE-80',
        productName: 'High Precision Servo Drive 80W',
        quotedQuantity: '100.000000',
        uomId,
        unitPriceMinor: '1500',
        discountPercentBasisPoints: 500, // 5%
        taxRateBasisPoints: 1000, // 10%
      },
    ],
  });
  assert.equal(quote.status, 'DRAFT');
  assert.equal(quote.subtotalMinor, '150000');
  assert.equal(quote.discountTotalMinor, '7500');
  assert.equal(quote.taxTotalMinor, '14250');
  assert.equal(quote.totalAmountMinor, '156750');

  // ─── Scenario 3: Quote Acceptance & Quote-to-Order Conversion ───────────────
  step('3. Testing Quote acceptance and conversion to Sales Order');
  const acceptedQuote = await orderService.acceptQuote(tenantA.tenantId, tenantA.subject, quote.id);
  assert.equal(acceptedQuote.status, 'ACCEPTED');

  const convertedOrder = await orderService.convertQuoteToOrder(
    tenantA.tenantId,
    tenantA.subject,
    acceptedQuote.id,
    warehouseId,
  );
  assert.equal(convertedOrder.status, 'DRAFT');
  assert.equal(convertedOrder.totalAmountMinor, '156750');
  assert.equal(convertedOrder.quoteId, quote.id);

  const reloadedQuote = await orderService.getQuote(tenantA.tenantId, quote.id);
  assert.equal(reloadedQuote.status, 'CONVERTED');

  // ─── Scenario 4: Multi-Tenant RLS Isolation ─────────────────────────────────
  step('4. Testing strict multi-tenant Row Level Security (RLS) isolation');
  let tenantBLeaked = false;
  try {
    await orderService.getOrder(tenantB.tenantId, convertedOrder.id);
    tenantBLeaked = true;
  } catch (err: any) {
    assert.match(err.message, /not found/i);
  }
  assert.equal(tenantBLeaked, false, 'Tenant B leaked Tenant A order across RLS boundary!');

  // ─── Scenario 5: Sales Order Confirmation Lifecycle ─────────────────────────
  step('5. Confirming Sales Order into confirmed status');
  const confirmedOrder = await orderService.confirmOrder(tenantA.tenantId, tenantA.subject, convertedOrder.id);
  assert.equal(confirmedOrder.status, 'CONFIRMED');
  const orderLineId = confirmedOrder.lines![0].id;

  // ─── Scenario 6: ATP Inventory Allocation & Over-Allocation Prevention ─────
  step('6. Testing ATP Inventory Allocation and over-allocation guard');
  // Attempt to allocate 120 units when only 100 ordered -> must throw invariant error
  let blockedOverAlloc = false;
  try {
    await orderService.allocateOrderLine(tenantA.tenantId, tenantA.subject, {
      orderId: confirmedOrder.id,
      orderLineId,
      warehouseId,
      allocatedQuantity: '120.000000',
    });
  } catch (err: any) {
    blockedOverAlloc = true;
    assert.match(err.message, /would exceed ordered quantity/i);
  }
  assert.ok(blockedOverAlloc, 'System allowed allocating more than ordered quantity!');

  // Valid allocation of 100 units
  const allocatedOrder = await orderService.allocateOrderLine(tenantA.tenantId, tenantA.subject, {
    orderId: confirmedOrder.id,
    orderLineId,
    warehouseId,
    allocatedQuantity: '100.000000',
  });
  assert.equal(allocatedOrder.status, 'PROCESSING');
  assert.equal(allocatedOrder.lines![0].allocatedQuantity, '100.000000');
  assert.equal(allocatedOrder.lines![0].status, 'ALLOCATED');

  // ─── Scenario 7: Outbound Fulfillment & Over-Shipment Prevention ────────────
  step('7. Creating partial fulfillment and preventing over-shipment beyond allocated');
  // Attempt to fulfill 110 units when only 100 allocated -> must throw invariant error
  let blockedOverShip = false;
  try {
    await orderService.createFulfillment(tenantA.tenantId, tenantA.subject, {
      orderId: confirmedOrder.id,
      warehouseId,
      lines: [
        {
          orderLineId,
          shippedQuantity: '110.000000',
        },
      ],
    });
  } catch (err: any) {
    blockedOverShip = true;
    assert.match(err.message, /would exceed allocated quantity/i);
  }
  assert.ok(blockedOverShip, 'System allowed fulfilling more than allocated quantity!');

  // Valid partial fulfillment of 60 units
  const partialFulfillment = await orderService.createFulfillment(tenantA.tenantId, tenantA.subject, {
    orderId: confirmedOrder.id,
    warehouseId,
    carrier: 'DHL Express',
    trackingNumber: 'DHL-EXP-992014',
    lines: [
      {
        orderLineId,
        shippedQuantity: '60.000000',
        lotNumber: 'LOT-2026-Q4-01',
      },
    ],
  });
  assert.equal(partialFulfillment.status, 'DRAFT');
  assert.equal(partialFulfillment.lines![0].shippedQuantity, '60.000000');

  // Verify order line reflects partial shipment
  const orderAfterFO = await orderService.getOrder(tenantA.tenantId, confirmedOrder.id);
  assert.equal(orderAfterFO.lines![0].shippedQuantity, '60.000000');
  assert.equal(orderAfterFO.lines![0].status, 'PARTIALLY_SHIPPED');

  // ─── Scenario 8: Fulfillment Order Dispatch ────────────────────────────────
  step('8. Dispatching fulfillment order and updating order status');
  const dispatchedFO = await orderService.dispatchFulfillment(
    tenantA.tenantId,
    tenantA.subject,
    partialFulfillment.id,
  );
  assert.equal(dispatchedFO.status, 'SHIPPED');

  const orderAfterDispatch = await orderService.getOrder(tenantA.tenantId, confirmedOrder.id);
  assert.equal(orderAfterDispatch.status, 'PARTIALLY_FULFILLED');

  // ─── Scenario 9: Customer AR Invoice Generation Matching Shipped Quantities ──
  step('9. Generating Customer AR Invoice strictly bounded by shipped quantity');
  // First invoice for 60 units shipped
  const invoice = await orderService.createCustomerInvoice(tenantA.tenantId, tenantA.subject, {
    orderId: confirmedOrder.id,
    dueDate: '2026-11-15T00:00:00Z',
  });
  assert.equal(invoice.status, 'ISSUED');
  assert.equal(invoice.lines![0].invoicedQuantity, '60.000000');
  // 60 units @ $15.00 (1500 minor) = 90,000 minor raw subtotal + 10% tax (9,000 minor) = 99,000 minor
  assert.equal(invoice.totalAmountMinor, '99000');

  // Attempting second invoice immediately when no additional shipped units remain -> throws error
  let blockedEmptyInvoice = false;
  try {
    await orderService.createCustomerInvoice(tenantA.tenantId, tenantA.subject, {
      orderId: confirmedOrder.id,
      dueDate: '2026-11-15T00:00:00Z',
    });
  } catch (err: any) {
    blockedEmptyInvoice = true;
    assert.match(err.message, /No un-invoiced shipped quantities available/i);
  }
  assert.ok(blockedEmptyInvoice, 'System generated invoice with zero unbilled shipped quantity!');

  // ─── Scenario 10: Customer RMA Return & Credit Memo Issuance ────────────────
  step('10. Issuing Customer RMA Credit Memo');
  // Customer returns 5 units for credit @ 1500 minor = 7500 minor ($75.00)
  const creditMemo = await orderService.createCreditMemo(tenantA.tenantId, tenantA.subject, {
    customerPartyId,
    orderId: confirmedOrder.id,
    invoiceId: invoice.id,
    currencyCode: 'USD',
    reason: 'Customer RMA #9102: Motor bearing flange defect',
    lines: [
      {
        productId,
        quantity: '5.000000',
        unitPriceMinor: '1500',
        reason: 'Cosmetic flaw on mounting bracket',
      },
    ],
  });
  assert.equal(creditMemo.status, 'ISSUED');
  assert.equal(creditMemo.totalAmountMinor, '7500');

  // ─── Scenario 11: Database Immutability Trigger & Safe AST Validation ───────
  step('11. Testing Anti-Tamper delete trigger trg_fulfillment_order_lines_immutable & AST Rules');
  const foLineId = partialFulfillment.lines![0].id;
  let blockedDelete = false;
  await db.withTenantTransaction(tenantA.tenantId, async (client) => {
    try {
      await client.query(
        `DELETE FROM gigalibs_orders.fulfillment_order_lines WHERE tenant_id = $1 AND id = $2`,
        [tenantA.tenantId, foLineId],
      );
    } catch (err: any) {
      blockedDelete = true;
      assert.match(err.message, /immutable/i);
    }
  });
  assert.ok(blockedDelete, 'Fulfillment order line was deleted, violating immutability trigger!');

  // Safe AST Validation Rules Test
  const rules: readonly DictionaryValidationRuleV1[] = [
    {
      ruleKey: 'rule-credit-limit-guard',
      label: 'Credit Limit Exception Notification',
      errorMessage: 'Credit limit exception override authorized requires co-sign.',
      severity: 'WARNING',
      condition: {
        field: 'credit_limit_override_authorized',
        operator: 'EQ',
        value: false,
      },
    },
  ];

  const cleanErrors = validateDictionaryRules(rules, { credit_limit_override_authorized: false });
  assert.equal(Object.keys(cleanErrors).length, 0);

  const triggeredErrors = validateDictionaryRules(rules, { credit_limit_override_authorized: true });
  assert.ok(triggeredErrors['credit_limit_override_authorized']?.includes('Credit limit exception override'));

  step('ALL 11 REAL DATABASE CERTIFICATION SCENARIOS PASSED WITH ACID INTEGRITY!');
} finally {
  await db.onModuleDestroy().catch(() => {});
  postgres.stop();
}
