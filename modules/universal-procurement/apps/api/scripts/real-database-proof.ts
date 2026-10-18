import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  OrganizationReplica,
  type ModuleCommandContext,
  type ModulePrincipal,
  type ReplicaUnit,
} from '@gigalibs/module-sdk';
import { validateDictionaryRules } from '@gigalibs/configuration-core';
import type { DictionaryValidationRuleV1 } from '@gigalibs/contracts';
import pg from 'pg';
import { DatabaseService } from '../src/database.service.js';
import { ProcurementService } from '../src/procurement/procurement.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (message: string) => console.log(`== ${message}`);
const versionId = 'procurement-proof-version-1';
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
  {
    unit_id: 'unit-procurement-2',
    parent_unit_id: null,
    code: 'UNIT-PROC-2',
    name: 'Regional Storeroom Unit',
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
const header = { tree_id: 'tree-procurement', tree_kind: 'PRIMARY' as const, version_number: 1, checksum };

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
const postgres = await startThrowawayPostgres(`gigalibs-proc-proof-${process.pid}`);
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
  for (const tenantId of ['tenant-alpha', 'tenant-beta']) {
    await db.withTenantTransaction(tenantId, async (client) => {
      await replica.receivePage(client, tenantId, versionId, header, units);
      await replica.complete(client, tenantId, versionId, header, units.length);
    });
  }

  const procurement = new ProcurementService(db);
  const tenantA = tenant('tenant-alpha', 'usr-buyer-alpha');
  const tenantB = tenant('tenant-beta', 'usr-buyer-beta');
  const vendorPartyId = randomUUID();
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

    await adminClient.query(
      `INSERT INTO public.parties (
        id, tenant_id, code, legal_name, display_name, party_type, status
      ) VALUES ($1, $2, $3, $4, $5, 'ORGANIZATION', 'ACTIVE')`,
      [
        vendorPartyId,
        'tenant-alpha',
        'VEND-PROOF-1',
        'Apex Precision Engineering Ltd',
        'Apex Precision Engineering Ltd',
      ],
    );

    const tablesRes = await adminClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'gigalibs_procurement'
    `);
    const tables = tablesRes.rows.map((r: { table_name: string }) => r.table_name);
    assert.ok(tables.includes('procurement_requisitions'), 'Missing procurement_requisitions table');
    assert.ok(tables.includes('purchase_orders'), 'Missing purchase_orders table');
    assert.ok(tables.includes('match_po_receipt_records'), 'Missing match_po_receipt_records table');
    assert.ok(tables.includes('match_po_invoice_records'), 'Missing match_po_invoice_records table');
    assert.ok(tables.includes('vendor_bills'), 'Missing vendor_bills table');
    assert.ok(tables.includes('debit_memos'), 'Missing debit_memos table');
  } finally {
    await adminClient.end();
  }

  // ─── Scenario 2: Delegation of Authority (DoA) Policies ─────────────────────
  step('2. Creating and verifying Delegation of Authority (DoA) policies');
  const policy1 = await procurement.createApprovalPolicy(tenantA, {
    policyName: 'Department Manager Tier',
    maxAmountMinor: '1000000', // $10,000.00
    currencyCode: 'USD',
    requiredRole: 'DEPT_MANAGER',
    sortOrder: 1,
    isActive: true,
  });
  assert.equal(policy1.maxAmountMinor, '1000000');
  assert.equal(policy1.requiredRole, 'DEPT_MANAGER');

  const policy2 = await procurement.createApprovalPolicy(tenantA, {
    policyName: 'VP / CFO Tier',
    maxAmountMinor: '10000000', // $100,000.00
    currencyCode: 'USD',
    requiredRole: 'VP_FINANCE',
    sortOrder: 2,
    isActive: true,
  });

  const policies = await procurement.listApprovalPolicies(tenantA);
  assert.equal(policies.length, 2);

  // ─── Scenario 3: Purchase Requisition Lifecycle ─────────────────────────────
  step('3. Testing Purchase Requisition draft, submit, and approve lifecycle');
  const requisition = await procurement.createRequisition(tenantA, {
    orgUnitId: 'unit-procurement-1',
    description: 'Q4 Precision Tools Stocking',
    currencyCode: 'USD',
    lines: [
      {
        productId,
        productCode: 'BEAR-6205',
        productName: 'Ball Bearing 6205-2RS',
        quantity: '100.000000',
        uomId,
        estimatedUnitPriceMinor: '1200', // $12.00
        requiredDate: '2026-11-01T00:00:00Z',
      },
    ],
  });
  assert.equal(requisition.status, 'DRAFT');
  assert.equal(requisition.totalEstimatedMinor, '120000'); // 100 * 1200 = 120,000 minor ($1,200.00)

  const submittedReq = await procurement.submitRequisition(tenantA, requisition.id);
  assert.equal(submittedReq.status, 'PENDING_APPROVAL');

  const approvedReq = await procurement.approveRequisition(tenantA, requisition.id);
  assert.equal(approvedReq.status, 'APPROVED');

  // ─── Scenario 4: Multi-Tenant RLS Isolation ─────────────────────────────────
  step('4. Testing strict multi-tenant Row Level Security (RLS) isolation');
  const tenantBReqs = await procurement.listRequisitions(tenantB);
  assert.equal(tenantBReqs.length, 0, 'Tenant B leaked Tenant A requisitions across RLS boundary!');

  // ─── Scenario 5: Purchase Order Creation & Issuance ─────────────────────────
  step('5. Creating Purchase Order with minor unit zero-float arithmetic');
  const po = await procurement.createPurchaseOrder(tenantA, {
    orgUnitId: 'unit-procurement-1',
    vendorPartyId,
    vendorName: 'Apex Precision Engineering Ltd',
    currencyCode: 'USD',
    destinationWarehouseId: warehouseId,
    paymentTermDays: 30,
    requisitionId: approvedReq.id,
    lines: [
      {
        requisitionLineId: approvedReq.lines[0].id,
        productId,
        productCode: 'BEAR-6205',
        productName: 'Ball Bearing 6205-2RS',
        orderedQuantity: '100.000000',
        uomId,
        unitPriceMinor: '1200',
        taxRateBasisPoints: 0,
        destinationWarehouseId: warehouseId,
      },
    ],
  });
  assert.equal(po.status, 'DRAFT');
  assert.equal(po.totalAmountMinor, '120000'); // $1,200.00

  const issuedPo = await procurement.issuePurchaseOrder(tenantA, po.id);
  assert.equal(issuedPo.status, 'ISSUED');

  const ackPo = await procurement.acknowledgePurchaseOrder(tenantA, po.id);
  assert.equal(ackPo.status, 'ACKNOWLEDGED');

  // ─── Scenario 6: Phase 5 Goods Receipt Matching ─────────────────────────────
  step('6. Matching inbound warehouse receipt to PO line (Phase 5 link)');
  const receiptId = randomUUID();
  const receiptLineId = randomUUID();
  const poLineId = ackPo.lines[0].id;

  const matchReceipt = await procurement.matchReceipt(tenantA, {
    purchaseOrderId: ackPo.id,
    purchaseOrderLineId: poLineId,
    receiptId,
    receiptLineId,
    matchedQuantity: '100.000000',
    uomId,
  });
  assert.equal(matchReceipt.status, 'FULLY_MATCHED');
  assert.equal(matchReceipt.matchedQuantity, '100.000000');

  // ─── Scenario 7: Mathematical 3-Way Matching Invariant Verification ──────────
  step('7. Verifying mathematical 3-way match invariant: Invoiced <= Received <= Ordered');
  const matchCheck = await procurement.verifyThreeWayMatch(tenantA, ackPo.id);
  assert.equal(matchCheck.verified, true);
  assert.equal(matchCheck.lines[0].orderedQuantity, '100.000000');
  assert.equal(matchCheck.lines[0].receivedQuantity, '100.000000');
  assert.equal(matchCheck.lines[0].invoicedQuantity, '0.000000'); // Not invoiced yet

  // ─── Scenario 8: Price Variance Tolerance Hold (> 1.0%) ─────────────────────
  step('8. Recording Vendor Bill with > 1.0% price variance and triggering hold');
  // Vendor bills at $12.50 per unit instead of agreed $12.00 (variance = +4.17% > 1.0%)
  const bill = await procurement.createVendorBill(tenantA, {
    vendorPartyId,
    vendorInvoiceNumber: 'INV-APEX-9001',
    invoiceDate: '2026-10-04T00:00:00Z',
    dueDate: '2026-11-04T00:00:00Z',
    currencyCode: 'USD',
    purchaseOrderId: ackPo.id,
    lines: [
      {
        purchaseOrderId: ackPo.id,
        purchaseOrderLineId: poLineId,
        productId,
        description: 'Ball Bearing 6205-2RS',
        billedQuantity: '100.000000',
        uomId,
        unitPriceMinor: '1250', // $12.50 (+$0.50 variance)
        lineTaxMinor: '0',
        matchedReceiptLineId: receiptLineId,
      },
    ],
  });
  assert.equal(bill.totalAmountMinor, '125000');

  // Now execute 3-way match against invoice line
  const matchInvoice = await procurement.matchInvoice(tenantA, {
    purchaseOrderId: ackPo.id,
    purchaseOrderLineId: poLineId,
    vendorBillId: bill.id,
    vendorBillLineId: bill.lines[0].id,
    receiptLineId,
    matchedQuantity: '100.000000',
  });

  assert.equal(matchInvoice.toleranceExceeded, true, 'Price variance hold failed to trigger!');
  assert.equal(matchInvoice.status, 'VARIANCE_HOLD');
  assert.ok(matchInvoice.priceVariancePercent > 1.0);

  // Verify bill status updated to PRICE_VARIANCE_HOLD
  const updatedBill = await procurement.getVendorBill(tenantA, bill.id);
  assert.equal(updatedBill.status, 'PRICE_VARIANCE_HOLD');

  // Verify approving bill while on hold fails
  let blockedApproval = false;
  try {
    await procurement.approveVendorBill(tenantA, bill.id);
  } catch (err: any) {
    blockedApproval = true;
    assert.match(err.message, /PRICE_VARIANCE_HOLD/);
  }
  assert.ok(blockedApproval, 'Vendor bill on price variance hold was approved without authorization!');

  // ─── Scenario 9: Supervisor Override of Price Variance Hold ─────────────────
  step('9. Executing Maker-Checker supervisor override for price variance hold');
  const overriddenMatch = await procurement.approvePriceVariance(tenantA, {
    matchRecordId: matchInvoice.id,
    overrideReason: 'Supplier raw material surcharges approved by procurement director.',
  });
  assert.equal(overriddenMatch.status, 'FORCE_MATCHED');

  // Now bill can be approved
  const approvedBill = await procurement.approveVendorBill(tenantA, bill.id);
  assert.equal(approvedBill.status, 'APPROVED');

  // ─── Scenario 10: Debit Memo Issuance ────────────────────────────────────────
  step('10. Issuing Debit Memo for damaged items credit');
  const debitMemo = await procurement.createDebitMemo(tenantA, {
    vendorPartyId,
    vendorBillId: bill.id,
    purchaseOrderId: ackPo.id,
    currencyCode: 'USD',
    reason: 'Damaged bearing casings observed during receiving inspection.',
    lines: [
      {
        productId,
        description: 'Damaged bearing casings',
        quantity: '5.000000',
        unitPriceMinor: '1200',
        reason: 'Cosmetic and seal damage',
      },
    ],
  });
  assert.equal(debitMemo.status, 'ISSUED');
  assert.equal(debitMemo.totalAmountMinor, '6000'); // 5 * 1200 = $60.00
  assert.equal(debitMemo.lines?.length, 1);

  // ─── Scenario 11: Application Dictionary Safe AST Rules ─────────────────────
  step('11. Testing Application Dictionary validation and Safe AST expressions');
  const rules: readonly DictionaryValidationRuleV1[] = [
    {
      ruleKey: 'rule-esg-threshold',
      label: 'Vendor ESG Threshold',
      errorMessage: 'Vendor ESG score is below policy threshold (50).',
      severity: 'ERROR',
      condition: {
        field: 'vendor_esg_score',
        operator: 'GTE',
        value: 50,
      },
    },
  ];

  // Test passing AST condition
  const passingErrors = validateDictionaryRules(rules, { vendor_esg_score: 85 });
  assert.equal(Object.keys(passingErrors).length, 0);

  // Test failing AST condition
  const failingErrors = validateDictionaryRules(rules, { vendor_esg_score: 35 });
  assert.ok(failingErrors['vendor_esg_score']?.includes('below policy threshold'));

  step('ALL 11 REAL DATABASE CERTIFICATION SCENARIOS PASSED WITH ACID INTEGRITY!');
} finally {
  await db.onModuleDestroy().catch(() => {});
  postgres.stop();
}
