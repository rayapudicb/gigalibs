import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  OrganizationReplica,
  type ModuleCommandContext,
  type ModulePrincipal,
  type ReplicaUnit,
} from '@gigalibs/module-sdk';
import pg from 'pg';
import { DatabaseService } from '../src/database.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { startThrowawayPostgres } from './throwaway-postgres.js';

const step = (message: string) => console.log(`== ${message}`);
const versionId = 'inventory-proof-version-1';
const units: ReplicaUnit[] = [
  {
    unit_id: 'unit-a',
    parent_unit_id: null,
    code: 'UNIT-A',
    name: 'Logistics Unit A',
    sort_order: 0,
    status: 'ACTIVE',
    holds_records: true,
    type_code: 'OPERATING_UNIT',
  },
  {
    unit_id: 'unit-b',
    parent_unit_id: null,
    code: 'UNIT-B',
    name: 'Storeroom Unit B',
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
const header = { tree_id: 'tree-primary', tree_kind: 'PRIMARY' as const, version_number: 1, checksum };

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
const context = (p: ModulePrincipal, suffix = randomUUID()): ModuleCommandContext => ({
  principal: p,
  correlationId: `proof:${suffix}`,
});
const tenant = (tenantId: string, subject: string) =>
  principal(tenantId, subject, { mode: 'TENANT', tree_version: versionId });
const scoped = (tenantId: string, subject: string, unit: string) =>
  principal(tenantId, subject, {
    mode: 'UNITS',
    tree_version: versionId,
    read_roots: [unit],
    write_roots: [unit],
  });

const postgres = await startThrowawayPostgres(`gigalibs-inventory-proof-${process.pid}`);
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
  const replica = new OrganizationReplica('gigalibs_inventory');
  for (const tenantId of ['tenant-a', 'tenant-b']) {
    await db.withTenantTransaction(tenantId, async (client) => {
      await replica.receivePage(client, tenantId, versionId, header, units);
      await replica.complete(client, tenantId, versionId, header, units.length);
    });
  }

  const inventory = new InventoryService(db);
  const maker = scoped('tenant-a', 'maker-a', 'unit-a');
  const checker = scoped('tenant-a', 'checker-a', 'unit-a');
  const sibling = scoped('tenant-a', 'sibling-b', 'unit-b');
  const tenantAdmin = tenant('tenant-a', 'tenant-admin');
  const outsider = tenant('tenant-b', 'tenant-b-admin');

  step('1. Empty install, least-privilege role, and schema isolation');
  assert.equal(await db.currentTenantScope('tenant-a'), 'tenant-a');
  const admin = new pg.Client({ connectionString: postgres.adminUrl });
  await admin.connect();
  assert.equal(
    (await admin.query('SELECT value FROM public.unrelated_upgrade_sentinel WHERE id=1')).rows[0]?.value,
    'preserve-me',
  );
  await admin.end();

  step('2. Warehouse and location topology with org scoping');
  const wh = await inventory.createWarehouse(maker, {
    code: 'WH-MAIN',
    name: 'Main Distribution Center',
    warehouseType: 'PHYSICAL',
    orgUnitId: 'unit-a',
  });
  assert.equal(wh.code, 'WH-MAIN');
  assert.equal(wh.tenantId, 'tenant-a');

  const locStorage = await inventory.createLocation(maker, {
    warehouseId: wh.id,
    code: 'BIN-A1',
    name: 'Storage Bin A1',
    locationType: 'STORAGE',
    aisle: '01',
    rack: 'A',
    shelf: '01',
    bin: '01',
    barcode: 'BAR-BIN-A1',
    allowNegative: false,
  });
  assert.equal(locStorage.code, 'BIN-A1');

  const locReceiving = await inventory.createLocation(maker, {
    warehouseId: wh.id,
    code: 'LOC-REC',
    name: 'Receiving Dock',
    locationType: 'RECEIVING',
  });

  const locStaging = await inventory.createLocation(maker, {
    warehouseId: wh.id,
    code: 'LOC-STAGE',
    name: 'Staging Bay 1',
    locationType: 'STAGING',
  });

  step('3. Tenant B isolation check (RLS enforcement)');
  const tenantBWarehouses = await inventory.listWarehouses(outsider);
  assert.equal(tenantBWarehouses.length, 0, 'Tenant B must see 0 warehouses belonging to Tenant A');
  await assert.rejects(
    inventory.getWarehouse(outsider, wh.id),
    /not found/i,
    'Tenant B cannot fetch Tenant A warehouse by ID',
  );

  step('4. Application Dictionary custom lot metadata & Safe AST validation');
  const productId = randomUUID();
  const uomId = randomUUID();

  // Valid lot
  const validLot = await inventory.createLot(
    maker,
    {
      productId,
      lotNumber: 'LOT-CHEM-2026-01',
      batchCode: 'BATCH-99',
      customExtensions: {
        cold_chain_min_celsius: -20,
        cold_chain_max_celsius: -15,
        hazardous_material_class: 'CLASS_3_FLAMMABLE_LIQUID',
      },
    },
    [
      {
        ruleKey: 'rule-cold-chain-range',
        label: 'Cold chain max check',
        errorMessage: 'Max temperature must be <= 0 C.',
        severity: 'ERROR',
        condition: {
          operator: 'LTE',
          field: 'cold_chain_max_celsius',
          value: 0,
        },
      },
    ],
  );
  assert.equal(validLot.lotNumber, 'LOT-CHEM-2026-01');
  assert.ok(validLot.manifestChecksum, 'Checksum captured on lot');

  // Invalid lot violating AST rule
  await assert.rejects(
    inventory.createLot(
      maker,
      {
        productId,
        lotNumber: 'LOT-INVALID',
        customExtensions: {
          cold_chain_min_celsius: 10,
          cold_chain_max_celsius: 5,
        },
      },
      [
        {
          ruleKey: 'rule-cold-chain-range',
          label: 'Cold chain max check',
          errorMessage: 'Max temperature must be <= 0 C.',
          severity: 'ERROR',
          condition: {
            operator: 'LTE',
            field: 'cold_chain_max_celsius',
            value: 0,
          },
        },
      ],
    ),
    /Application Dictionary validation failed/i,
    'Safe AST rule successfully rejected invalid lot range',
  );

  step('5. Inbound Receiving & Putaway lifecycle with double-entry debit');
  const receipt = await inventory.createReceipt(maker, {
    warehouseId: wh.id,
    externalDocumentReference: 'PO-2026-888',
    lines: [
      {
        productId,
        uomId,
        expectedQuantity: '100.000000',
        targetLocationId: locReceiving.id,
        lotNumber: 'LOT-CHEM-2026-01',
      },
    ],
  });
  assert.equal(receipt.status, 'DRAFT');

  const completedReceipt = await inventory.completeReceipt(maker, receipt.id);
  assert.equal(completedReceipt.status, 'COMPLETED');

  // Verify stock balance at receiving dock
  const balancesAtRec = await inventory.listBalances(maker, wh.id);
  const recBal = balancesAtRec.find((b) => b.locationId === locReceiving.id);
  assert.ok(recBal);
  assert.equal(recBal.onHandQuantity, '100.000000');
  assert.equal(recBal.availableQuantity, '100.000000');

  step('6. Stock movement via append-only ledger & negative stock prevention');
  // Attempt to move 150 (only 100 available, allowNegative is false)
  await assert.rejects(
    inventory.postMovement(maker, {
      documentType: 'PUTAWAY',
      reason: 'PUTAWAY',
      correlationId: 'corr-putaway-excess',
      idempotencyKey: 'idem-excess',
      sourceWarehouseId: wh.id,
      sourceLocationId: locReceiving.id,
      targetWarehouseId: wh.id,
      targetLocationId: locStorage.id,
      productId,
      uomId,
      quantity: '150.000000',
      lotId: validLot.id,
    }),
    /Insufficient stock.*Negative stock is not permitted/i,
    'Negative stock invariant enforced',
  );

  // Put away 80 units into Storage Bin
  const moveRes = await inventory.postMovement(maker, {
    documentType: 'PUTAWAY',
    reason: 'PUTAWAY',
    correlationId: 'corr-putaway-1',
    idempotencyKey: 'idem-putaway-1',
    sourceWarehouseId: wh.id,
    sourceLocationId: locReceiving.id,
    targetWarehouseId: wh.id,
    targetLocationId: locStorage.id,
    productId,
    uomId,
    quantity: '80.000000',
    lotId: validLot.id,
  });
  assert.equal(moveRes.entries.length, 2, 'Balanced Credit + Debit entries posted');
  assert.equal(moveRes.entries[0].direction, 'CREDIT');
  assert.equal(moveRes.entries[1].direction, 'DEBIT');

  // Check updated balances
  const balancesAfterMove = await inventory.listBalances(maker, wh.id);
  const recBalAfter = balancesAfterMove.find((b) => b.locationId === locReceiving.id);
  const storageBalAfter = balancesAfterMove.find((b) => b.locationId === locStorage.id);
  assert.equal(recBalAfter?.onHandQuantity, '20.000000');
  assert.equal(storageBalAfter?.onHandQuantity, '80.000000');

  step('7. Trigger immutability proof on ledger entries');
  const runtimeClient = new pg.Client({ connectionString: postgres.runtimeUrl });
  await runtimeClient.connect();
  await runtimeClient.query("SET LOCAL app.tenant_id = 'tenant-a'");
  await assert.rejects(
    runtimeClient.query(`DELETE FROM gigalibs_inventory.stock_ledger_entries WHERE id = $1`, [
      moveRes.entries[0].id,
    ]),
    /permission denied/i,
    'Least privilege prevents DELETE for runtime role',
  );
  await assert.rejects(
    runtimeClient.query(
      `UPDATE gigalibs_inventory.stock_ledger_entries SET quantity = 999 WHERE id = $1`,
      [moveRes.entries[0].id],
    ),
    /permission denied/i,
    'Least privilege prevents UPDATE for runtime role',
  );
  await runtimeClient.end();

  const adminClient = new pg.Client({ connectionString: postgres.adminUrl });
  await adminClient.connect();
  await assert.rejects(
    adminClient.query(`DELETE FROM gigalibs_inventory.stock_ledger_entries WHERE id = $1`, [
      moveRes.entries[0].id,
    ]),
    /strictly immutable/i,
    'Ledger trigger successfully prevented DELETE for admin',
  );
  await assert.rejects(
    adminClient.query(
      `UPDATE gigalibs_inventory.stock_ledger_entries SET quantity = 999 WHERE id = $1`,
      [moveRes.entries[0].id],
    ),
    /strictly immutable/i,
    'Ledger trigger successfully prevented UPDATE for admin',
  );
  await adminClient.end();

  step('8. Work order reservation & maintenance kitting (CMMS integration)');
  const reservation = await inventory.createReservation(maker, {
    reservationType: 'HARD',
    demandType: 'WORK_ORDER',
    demandReferenceId: 'WO-2026-904',
    warehouseId: wh.id,
    productId,
    uomId,
    quantity: '25.000000',
  });
  assert.equal(reservation.status, 'ACTIVE');

  // Create and stage kit
  const kit = await inventory.createKit(maker, {
    workOrderId: 'WO-2026-904',
    warehouseId: wh.id,
    items: [{ productId, uomId, requestedQuantity: '25.000000' }],
  });
  assert.equal(kit.status, 'DRAFT');

  const stagedKit = await inventory.stageKit(maker, kit.id, locStaging.id);
  assert.equal(stagedKit.status, 'STAGED');

  const issuedKit = await inventory.issueKit(maker, kit.id, 'tech-rob');
  assert.equal(issuedKit.status, 'ISSUED');
  assert.equal(issuedKit.assignedTechnicianId, 'tech-rob');

  step('9. Cycle counts and four-eyes maker-checker adjustment');
  const countPlan = await inventory.createCountPlan(maker, {
    name: 'Q4 Spot Count',
    planType: 'SPOT',
    warehouseId: wh.id,
    isBlindCount: true,
  });

  // Storage Bin currently has 80 units. Physical observation reveals 85 units (+5 variance).
  const countEntry = await inventory.submitCountEntry(maker, countPlan.id, {
    locationId: locStorage.id,
    productId,
    countedQuantity: '85.000000',
  });
  assert.equal(countEntry.varianceQuantity, '5.000000');

  // Find generated pending adjustment
  const adjAdminClient = new pg.Client({ connectionString: postgres.adminUrl });
  await adjAdminClient.connect();
  const adjRow = (
    await adjAdminClient.query(
      `SELECT id FROM gigalibs_inventory.inventory_adjustments WHERE count_plan_id = $1`,
      [countPlan.id],
    )
  ).rows[0];
  await adjAdminClient.end();

  // Attempt self-approval by maker -> MUST FAIL
  await assert.rejects(
    inventory.approveAdjustment(maker, adjRow.id, { notes: 'Self approving variance' }),
    /Maker-checker policy violation/i,
    'Four-eyes rule blocked self-approval',
  );

  // Independent approval by checker -> MUST SUCCEED
  const approvedAdj = await inventory.approveAdjustment(checker, adjRow.id, {
    notes: 'Supervisor verified recount. Gain approved.',
  });
  assert.equal(approvedAdj.status, 'APPROVED');

  const balancesAfterCount = await inventory.listBalances(maker, wh.id);
  const storageBalAfterCount = balancesAfterCount.find((b) => b.locationId === locStorage.id);
  assert.equal(storageBalAfterCount?.onHandQuantity, '85.000000', 'Balance adjusted to 85 units');

  step('10. Barcode resolution simulator');
  const resolvedLoc = await inventory.resolveBarcode(maker, 'BAR-BIN-A1');
  assert.equal(resolvedLoc.entityType, 'LOCATION');
  assert.equal(resolvedLoc.matchedCode, 'BIN-A1');

  const resolvedLot = await inventory.resolveBarcode(maker, 'LOT-CHEM-2026-01');
  assert.equal(resolvedLot.entityType, 'LOT');

  step('11. 100% Ledger Rebuild Reconciliation');
  const rebuild = await inventory.rebuildBalances(maker, wh.id);
  assert.equal(rebuild.reconciled, true, 'Every materialized balance equals net ledger sum');
  console.log(
    `Reconciliation success: Net ledger sum = ${rebuild.totalLedgerBalance}, Total materialized = ${rebuild.totalMaterializedBalance}`,
  );

  console.log('\n======================================================');
  console.log('✅ ALL 11 REAL DATABASE INVENTORY CERTIFICATION PROOFS PASSED');
  console.log('======================================================\n');
} finally {
  await db.onModuleDestroy().catch(() => {});
  postgres.stop();
}
