import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1 } from '@gigalibs/contracts';
import { DatabaseService } from '../database.service.js';
import { FinanceInventoryInboxService } from '../relay/finance-inbox.service.js';
import { InventoryPostingCutoffService } from './inventory-posting-cutoff.service.js';
import { InventoryService } from './inventory.service.js';
import { InventoryRecordsService } from './inventory-records.service.js';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';

const enabled = process.env.INVENTORY_PG_PROOF === '1';

describe.skipIf(!enabled)('Material Ledger reservation concurrency on isolated PostgreSQL', () => {
  let postgres: ThrowawayPostgres;
  let db: DatabaseService;
  let inventory: InventoryService;
  const tenantId = 'tenant-concurrency';
  const principal: ModulePrincipal = {
    tenantId,
    subject: 'proof-user',
    sessionId: 'session-proof',
    authVersion: 1,
    permissions: ['*'],
    roles: ['TENANT_ADMIN'],
    persona: 'TENANT_ADMIN',
    organization: { mode: 'TENANT' },
    departmentScope: { mode: 'ALL' },
    placeScope: { mode: 'ALL' },
  };

  let warehouseId = '';
  let locationId = '';
  let firstReservationId = '';
  const productId = randomUUID();
  const uomId = randomUUID();

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-inv-concurrency-${process.pid}`);
    db = new DatabaseService({
      databaseUrl: postgres.runtimeUrl,
      databasePoolSize: 5,
      expectedMigrationVersion: 13,
      platformContextAudience: 'proof',
      platformContextPublicKey: 'proof',
      corsOrigins: [],
      apiHost: '127.0.0.1',
      apiPort: 0,
    } as never);
    inventory = new InventoryService(db, new InventoryPostingCutoffService());
    await db.onModuleInit();
  }, 120_000);

  afterAll(async () => {
    await db?.onModuleDestroy();
    postgres?.stop();
  });

  it('prepares warehouse stock (10 units available)', async () => {
    const wh = await inventory.createWarehouse(principal, {
      code: 'WH-CONC',
      name: 'Concurrency WH',
      warehouseType: 'PHYSICAL',
      orgUnitId: 'unit-a',
    });
    warehouseId = wh.id;
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_inventory.inventory_org_valuation_settings
           (tenant_id, org_unit_id, valuation_method, finance_cost_profile_id, updated_by)
         VALUES ($1, 'unit-a', 'FIFO', $2, 'proof-user')`,
        [tenantId, randomUUID()],
      );
    });
    const loc = await inventory.createLocation(principal, {
      warehouseId,
      code: 'BIN-1',
      name: 'Bin 1',
      locationType: 'STORAGE',
    });
    locationId = loc.id;
    const receipt = await inventory.createReceipt(principal, {
      warehouseId,
      lines: [{ productId, uomId, expectedQuantity: '10.000000', targetLocationId: locationId }],
    });
    await inventory.completeReceipt(principal, receipt.id);
    const atp = await inventory.checkAtp(principal, {
      requestKey: randomUUID(),
      warehouseId,
      productId,
      uomId,
      requestedQuantity: '10.000000',
    });
    expect(atp.decision).toBe('AVAILABLE');
  }, 60_000);

  it('replays an identical movement and rejects a key reused for different stock', async () => {
    const destination = await inventory.createLocation(principal, {
      warehouseId, code: 'BIN-REPLAY', name: 'Replay bin', locationType: 'STORAGE',
    });
    const movement = {
      documentType: 'PROOF_TRANSFER', reason: 'TRANSFER' as const,
      correlationId: randomUUID(), idempotencyKey: randomUUID(),
      sourceWarehouseId: warehouseId, sourceLocationId: locationId,
      targetWarehouseId: warehouseId, targetLocationId: destination.id,
      productId, uomId, quantity: '1.000000', stockStatus: 'AVAILABLE' as const,
    };
    const first = await inventory.postMovement(principal, movement);
    expect(await inventory.postMovement(principal, movement)).toEqual(first);
    await expect(inventory.postMovement(principal, { ...movement, quantity: '2.000000' }))
      .rejects.toThrow('already used for a different stock movement');
    const balances = await inventory.listBalances(principal, warehouseId);
    expect(balances.find((row) => row.locationId === destination.id)?.onHandQuantity).toBe('1.000000');
    const reversal = await inventory.reverseMovement(principal, first.transaction.id);
    expect(reversal.transaction.documentReferenceId).toBe(first.transaction.id);
    expect(reversal.transaction.documentType).toBe('STOCK_REVERSAL');
    expect(await inventory.reverseMovement(principal, first.transaction.id)).toEqual(reversal);
    const afterReverse = await inventory.listBalances(principal, warehouseId);
    expect(afterReverse.find((row) => row.locationId === destination.id)?.onHandQuantity).toBe('0.000000');
    expect(afterReverse.find((row) => row.locationId === locationId && row.productId === productId)
      ?.onHandQuantity).toBe('10.000000');
  }, 60_000);

  it('replays a finished-goods receipt from its immutable fact and refuses changed output', async () => {
    await inventory.createLocation(principal, {
      warehouseId, code: 'RECEIVING-MO', name: 'Manufacturing receiving', locationType: 'RECEIVING',
    });
    const financeProfileId = randomUUID();
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `UPDATE gigalibs_inventory.inventory_org_valuation_settings
            SET finance_cost_profile_id = $1
          WHERE tenant_id = $2 AND org_unit_id = 'unit-a'`, [financeProfileId, tenantId],
      );
    });
    const command = {
      commandKey: randomUUID(), productionOrderId: randomUUID(), warehouseId,
      orgUnitId: 'unit-a', productId: randomUUID(), uomId,
      quantity: '2.000000',
    };
    const first = await inventory.receiveManufacturingFinishedGoods(principal, command);
    expect(first.financeCostProfileId).toBe(financeProfileId);
    const nextProfileId = randomUUID();
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `UPDATE gigalibs_inventory.inventory_org_valuation_settings
            SET finance_cost_profile_id = $1
          WHERE tenant_id = $2 AND org_unit_id = 'unit-a'`, [nextProfileId, tenantId],
      );
    });
    expect(await inventory.receiveManufacturingFinishedGoods(principal, command)).toEqual(first);
    await expect(inventory.receiveManufacturingFinishedGoods(principal, {
      ...command, quantity: '3.000000',
    })).rejects.toThrow('differs from the original command');
    const count = await db.withTenantTransaction(tenantId, async (client) => client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM gigalibs_inventory.receipts
        WHERE tenant_id = $1 AND external_document_reference = $2`,
      [tenantId, `manufacturing:${command.productionOrderId}`],
    ));
    expect(count.rows[0]?.count).toBe(1);
  }, 60_000);

  it('refuses a count loss that would consume another demand’s reserved stock', async () => {
    const countedProductId = randomUUID();
    const receipt = await inventory.createReceipt(principal, {
      warehouseId,
      lines: [{ productId: countedProductId, uomId, expectedQuantity: '2.000000', targetLocationId: locationId }],
    });
    await inventory.completeReceipt(principal, receipt.id);
    await inventory.createReservation(principal, {
      reservationType: 'HARD', demandType: 'SALES_ORDER', demandReferenceId: 'COUNT-LOSS-PROOF',
      warehouseId, productId: countedProductId, uomId, quantity: '2.000000',
      idempotencyKey: randomUUID(),
    });
    const plan = await inventory.createCountPlan(principal, {
      warehouseId, name: 'Reserved stock count', planType: 'SPOT',
      isBlindCount: true, allowMovementsDuringCount: false,
    });
    await inventory.submitCountEntry(principal, plan.id, {
      locationId, productId: countedProductId, countedQuantity: '0.000000',
    });
    const adjustmentId = await db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_inventory.inventory_adjustments
          WHERE tenant_id = $1 AND count_plan_id = $2`, [tenantId, plan.id],
      );
      return result.rows[0]!.id;
    });
    await expect(inventory.approveAdjustment({ ...principal, subject: 'proof-approver' }, adjustmentId,
      { notes: 'Count variance proof' })).rejects.toThrow('exceeds unreserved stock');
    const balance = (await inventory.listBalances(principal, warehouseId))
      .find((row) => row.productId === countedProductId);
    expect(balance).toMatchObject({ onHandQuantity: '2.000000', reservedQuantity: '2.000000' });
  }, 60_000);

  it('projects Finance-posted receipt valuation once and rejects conflicting or cross-tenant outcomes', async () => {
    const costProductId = randomUUID();
    const receipt = await inventory.createReceipt(principal, {
      warehouseId,
      lines: [{ productId: costProductId, uomId, expectedQuantity: '2.000000', targetLocationId: locationId }],
    });
    await inventory.completeReceipt(principal, receipt.id);
    const lineId = await db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{ id: string }>(
        'SELECT id FROM gigalibs_inventory.receipt_lines WHERE tenant_id = $1 AND receipt_id = $2',
        [tenantId, receipt.id],
      );
      return result.rows[0]!.id;
    });
    const inbox = new FinanceInventoryInboxService(db, new InventoryPostingCutoffService());
    const costLine = {
      receiptLineId: lineId,
      financeCostLayerId: randomUUID(),
      productId: costProductId,
      quantity: '2.000000',
      valuationMethod: 'FIFO' as const,
      unitCostScaled: '125000000',
      totalCostMinor: '250',
    };
    const makeOutcome = (tenant: string, line = costLine) => ({
      messageId: randomUUID(), tenantId: tenant,
      eventType: FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1,
      aggregateType: 'INVENTORY_RECEIPT', aggregateId: receipt.id, aggregateVersion: 1,
      correlationId: randomUUID(), causationId: null, schemaVersion: 1,
      payload: { receiptId: receipt.id, status: 'POSTED', costLines: [line] },
      occurredAt: new Date().toISOString(),
    });
    const posted = makeOutcome(tenantId);
    expect(await inbox.receive(posted, JSON.stringify(posted))).toEqual({ status: 'PROCESSED' });
    expect(await inbox.receive(posted, JSON.stringify(posted))).toEqual({ status: 'DUPLICATE' });
    const costs = await inventory.listPostedReceiptCosts(principal, costProductId);
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({
      receiptId: receipt.id, receiptLineId: lineId, financeCostLayerId: costLine.financeCostLayerId,
      valuationMethod: 'FIFO', quantity: '2.000000', unitCostScaled: '125000000', totalCostMinor: '250',
    });
    const conflicting = makeOutcome(tenantId, { ...costLine, totalCostMinor: '251' });
    expect(await inbox.receive(conflicting, JSON.stringify(conflicting)))
      .toEqual({ status: 'REJECTED', code: 'INVENTORY_COST_REPLAY_CONFLICT' });
    const otherTenant = makeOutcome('other-tenant');
    expect(await inbox.receive(otherTenant, JSON.stringify(otherTenant)))
      .toEqual({ status: 'REJECTED', code: 'INVENTORY_COST_LINE_SET_MISMATCH' });
    await expect(db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        'UPDATE gigalibs_inventory.inventory_receipt_cost_records SET total_cost_minor = 1 WHERE tenant_id = $1 AND id = $2',
        [tenantId, costs[0]!.id],
      );
    })).rejects.toThrow('append-only');
  }, 60_000);

  it('retries only a safe Finance rejection once without moving stock again', async () => {
    const retryProductId = randomUUID();
    const receipt = await inventory.createReceipt(principal, {
      warehouseId,
      lines: [{ productId: retryProductId, uomId, expectedQuantity: '1.000000', targetLocationId: locationId }],
    });
    await inventory.completeReceipt(principal, receipt.id);
    const before = await inventory.listBalances(principal, warehouseId);
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `UPDATE gigalibs_inventory.receipts
            SET finance_posting_status = 'POSTING_REJECTED', finance_posting_rejection_code = 'FINANCE_COST_METHOD_MISMATCH'
          WHERE tenant_id = $1 AND id = $2`,
        [tenantId, receipt.id],
      );
    });
    const requestKey = randomUUID();
    const retried = await inventory.retryReceiptFinancePosting(principal, receipt.id, requestKey);
    expect(retried.financePostingStatus).toBe('AWAITING_POSTING');
    expect(await inventory.retryReceiptFinancePosting(principal, receipt.id, requestKey)).toEqual(retried);
    expect(await inventory.listBalances(principal, warehouseId)).toEqual(before);
    const facts = await db.withTenantTransaction(tenantId, async (client) => client.query(
      `SELECT payload FROM gigalibs_inventory.outbox_events
        WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'inventory.receipt.completed.v1'
        ORDER BY aggregate_version`, [tenantId, receipt.id],
    ));
    expect(facts.rows).toHaveLength(2);
    expect(facts.rows[1]!.payload).toMatchObject({
      receiptId: receipt.id, orgUnitId: 'unit-a', valuationMethod: 'FIFO',
    });
    await expect(inventory.retryReceiptFinancePosting(principal, receipt.id, randomUUID()))
      .rejects.toThrow('needs reconciliation before retry');
  }, 60_000);

  it('allows only one of two concurrent 7-unit reservations', async () => {
    const attempt = (suffix: string) =>
      inventory.createReservation(principal, {
        reservationType: 'HARD',
        demandType: 'SALES_ORDER',
        demandReferenceId: `SO-${suffix}`,
        warehouseId,
        productId,
        uomId,
        quantity: '7.000000',
        idempotencyKey: `conc-${suffix}`,
      });

    const results = await Promise.allSettled([attempt('a'), attempt('b')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    const rejectionDetail = rejected
      .map((r) => (r.status === 'rejected' ? String(r.reason?.message ?? r.reason) : ''))
      .join(' | ');
    expect(fulfilled.length, rejectionDetail).toBe(1);
    expect(rejected.length).toBe(1);
    firstReservationId = fulfilled[0]!.status === 'fulfilled' ? fulfilled[0]!.value.id : '';
    const balances = await inventory.listBalances(principal, warehouseId);
    const totalReserved = balances.reduce((sum, row) => sum + Number(row.reservedQuantity), 0);
    expect(totalReserved).toBeLessThanOrEqual(10);
    expect(totalReserved).toBeGreaterThanOrEqual(7);
  }, 30_000);

  it('keeps locator allocations separate across issue and release', async () => {
    const secondLocation = await inventory.createLocation(principal, {
      warehouseId,
      code: 'BIN-2',
      name: 'Bin 2',
      locationType: 'STORAGE',
    });
    const secondReceipt = await inventory.createReceipt(principal, {
      warehouseId,
      lines: [{ productId, uomId, expectedQuantity: '4.000000', targetLocationId: secondLocation.id }],
    });
    await inventory.completeReceipt(principal, secondReceipt.id);

    await expect(inventory.postMovement(principal, {
      documentType: 'SCANNER_PUTAWAY', reason: 'TRANSFER', correlationId: randomUUID(),
      idempotencyKey: randomUUID(), sourceWarehouseId: warehouseId, sourceLocationId: locationId,
      targetWarehouseId: warehouseId, targetLocationId: secondLocation.id,
      productId, uomId, quantity: '4.000000', stockStatus: 'AVAILABLE',
    })).rejects.toThrow('Insufficient unreserved stock');

    await expect(inventory.createReservation(principal, {
      reservationType: 'HARD', demandType: 'SALES_ORDER', demandReferenceId: 'SO-locator-short',
      warehouseId, locationId: secondLocation.id, productId, uomId, quantity: '5.000000',
    })).rejects.toThrow();

    const orderId = randomUUID();
    const secondReservation = await inventory.createReservation(principal, {
      reservationType: 'HARD', demandType: 'SALES_ORDER', demandReferenceId: orderId,
      demandLineId: randomUUID(), warehouseId, locationId: secondLocation.id, productId, uomId, quantity: '4.000000',
    });
    const fulfillmentId = randomUUID();
    await expect(inventory.issueStockForOrderFulfillment(principal, {
      reservationId: secondReservation.id, orderId: randomUUID(), fulfillmentId, quantity: '2.000000',
    })).rejects.toThrow('not bound to this sales order');
    const issue = await inventory.issueStockForOrderFulfillment(principal, {
      reservationId: secondReservation.id,
      orderId,
      fulfillmentId,
      quantity: '2.000000',
    });
    expect(await inventory.issueStockForOrderFulfillment(principal, {
      reservationId: secondReservation.id, orderId, fulfillmentId, quantity: '2.000000',
    })).toEqual(issue);
    await expect(inventory.issueStockForOrderFulfillment(principal, {
      reservationId: secondReservation.id, orderId, fulfillmentId, quantity: '1.000000',
    })).rejects.toThrow('Fulfillment key was already used');
    let balances = await inventory.listBalances(principal, warehouseId);
    expect(balances.find((row) => row.locationId === locationId)?.reservedQuantity).toBe('7.000000');
    expect(balances.find((row) => row.locationId === secondLocation.id)?.reservedQuantity).toBe('2.000000');
    await inventory.releaseReservation(principal, firstReservationId);
    balances = await inventory.listBalances(principal, warehouseId);
    expect(balances.find((row) => row.locationId === locationId)?.reservedQuantity).toBe('0.000000');
    expect(balances.find((row) => row.locationId === secondLocation.id)?.reservedQuantity).toBe('2.000000');
    await inventory.releaseReservation(principal, secondReservation.id);
    balances = await inventory.listBalances(principal, warehouseId);
    expect(balances.find((row) => row.locationId === secondLocation.id)?.reservedQuantity).toBe('0.000000');
  }, 60_000);

  it('fails closed for a legacy reservation with no allocation mapping', async () => {
    const orderId = randomUUID();
    const reservation = await inventory.createReservation(principal, {
      reservationType: 'HARD', demandType: 'SALES_ORDER', demandReferenceId: orderId,
      demandLineId: randomUUID(), warehouseId, locationId, productId, uomId, quantity: '1.000000',
    });
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        'DELETE FROM gigalibs_inventory.inventory_reservation_allocations WHERE tenant_id = $1 AND reservation_id = $2',
        [tenantId, reservation.id],
      );
    });
    await expect(inventory.releaseReservation(principal, reservation.id)).rejects.toThrow('reconcile inventory');
    await expect(inventory.issueStockForOrderFulfillment(principal, {
      reservationId: reservation.id, orderId, fulfillmentId: randomUUID(),
    })).rejects.toThrow('reconcile inventory');
    const balances = await inventory.listBalances(principal, warehouseId);
    expect(balances.find((row) => row.locationId === locationId)?.reservedQuantity).toBe('1.000000');
  }, 30_000);

  it('requires an organization valuation setting and keeps cost layers immutable', async () => {
    const costProductId = randomUUID();
    const costWarehouse = await inventory.createWarehouse(principal, {
      code: 'WH-COST', name: 'Cost proof warehouse', warehouseType: 'PHYSICAL', orgUnitId: 'unit-cost',
    });
    const costLocation = await inventory.createLocation(principal, {
      warehouseId: costWarehouse.id, code: 'BIN-COST', name: 'Cost proof bin', locationType: 'STORAGE',
    });
    const movement = (idempotencyKey: string) => inventory.postMovement(principal, {
      documentType: 'PROOF_RECEIPT', reason: 'RECEIPT', correlationId: randomUUID(), idempotencyKey,
      targetWarehouseId: costWarehouse.id, targetLocationId: costLocation.id, productId: costProductId, uomId,
      quantity: '2.000000', stockStatus: 'AVAILABLE', unitCostMinor: '125',
    });
    await expect(movement('cost-unconfigured')).rejects.toThrow('valuation method is not configured');
    const uncodedReceipt = await inventory.createReceipt(principal, {
      warehouseId: costWarehouse.id,
      lines: [{ productId: costProductId, uomId, expectedQuantity: '1.000000', targetLocationId: costLocation.id }],
    });
    await expect(inventory.completeReceipt(principal, uncodedReceipt.id))
      .rejects.toThrow('needs an owning organization and a Finance cost profile');
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_inventory.inventory_org_valuation_settings
           (tenant_id, org_unit_id, valuation_method, updated_by)
         VALUES ($1, $2, 'FIFO', 'proof-user')`,
        [tenantId, 'unit-cost'],
      );
    });
    await movement('cost-configured');
    const layers = await inventory.listCostLayers(principal, costProductId);
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({ valuationMethod: 'FIFO', quantity: '2.000000', unitCostMinor: '125' });
    await expect(db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        'UPDATE gigalibs_inventory.inventory_cost_layers SET unit_cost_minor = 1 WHERE tenant_id = $1 AND id = $2',
        [tenantId, layers[0]!.id],
      );
    })).rejects.toThrow('append-only');
  }, 30_000);

  it('denies warehouse reads and reservations for a denied organization claim', async () => {
    const denied: ModulePrincipal = { ...principal, organization: { mode: 'DENIED' } };
    expect(await inventory.listWarehouses(denied)).toEqual([]);
    expect(await inventory.listBalances(denied, warehouseId)).toEqual([]);
    await expect(inventory.getWarehouse(denied, warehouseId)).rejects.toThrow('outside your organization access');
    await expect(inventory.createReservation(denied, {
      reservationType: 'HARD', demandType: 'SALES_ORDER', demandReferenceId: 'SO-denied',
      warehouseId, productId, uomId, quantity: '1.000000',
    })).rejects.toThrow();
  }, 30_000);

  it('excludes quarantined lots from ATP and reservation', async () => {
    const quarantinedProduct = randomUUID();
    const receipt = await inventory.createReceipt(principal, {
      warehouseId,
      lines: [{ productId: quarantinedProduct, uomId, expectedQuantity: '2.000000',
        targetLocationId: locationId, lotNumber: 'LOT-Q' }],
    });
    await inventory.completeReceipt(principal, receipt.id);
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `UPDATE gigalibs_inventory.inventory_lots SET status = 'QUARANTINED'
         WHERE tenant_id = $1 AND product_id = $2 AND lot_number = 'LOT-Q'`,
        [tenantId, quarantinedProduct],
      );
    });
    const atp = await inventory.checkAtp(principal, {
      requestKey: randomUUID(), warehouseId, productId: quarantinedProduct, uomId,
      requestedQuantity: '1.000000',
    });
    expect(atp.decision).toBe('SHORT');
    await expect(inventory.createReservation(principal, {
      reservationType: 'HARD', demandType: 'SALES_ORDER', demandReferenceId: 'SO-quarantine',
      warehouseId, productId: quarantinedProduct, uomId, quantity: '1.000000',
    })).rejects.toThrow('Shortage');
  }, 30_000);

  it('hides sibling-unit warehouse records and refuses their mutation', async () => {
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_inventory.org_replica_versions
           (tenant_id, version_id, tree_id, tree_kind, version_number, checksum, status, unit_count, ready_at)
         VALUES ($1, 'v1', 'tree-1', 'PRIMARY', 1, $2, 'READY', 2, now())`,
        [tenantId, `sha256:${'0'.repeat(64)}`],
      );
      for (const unit of ['unit-a', 'unit-b']) {
        await client.query(
          `INSERT INTO gigalibs_inventory.org_replica_units
             (tenant_id, version_id, unit_id, code, name, sort_order, status, holds_records, type_code)
           VALUES ($1, 'v1', $2, $2, $2, 0, 'ACTIVE', true, 'OPERATING_UNIT')`,
          [tenantId, unit],
        );
        await client.query(
          `INSERT INTO gigalibs_inventory.org_replica_closure
             (tenant_id, version_id, ancestor_unit_id, descendant_unit_id, depth)
           VALUES ($1, 'v1', $2, $2, 0)`,
          [tenantId, unit],
        );
      }
    });
    const sibling = await inventory.createWarehouse(principal, {
      code: 'WH-B', name: 'Sibling warehouse', warehouseType: 'PHYSICAL', orgUnitId: 'unit-b',
    });
    const siblingLocation = await inventory.createLocation(principal, {
      warehouseId: sibling.id, code: 'BIN-B', name: 'Sibling bin', locationType: 'STORAGE', barcode: 'SCAN-BIN-B',
    });
    const unitA: ModulePrincipal = {
      ...principal,
      organization: { mode: 'UNITS', tree_version: 'v1', read_roots: ['unit-a'], write_roots: ['unit-a'] },
    };
    const warehouses = await inventory.listWarehouses(unitA);
    expect(warehouses.map((row) => row.id)).toContain(warehouseId);
    expect(warehouses.map((row) => row.id)).not.toContain(sibling.id);
    await expect(inventory.getWarehouse(unitA, sibling.id)).rejects.toThrow('outside your organization access');
    const records = new InventoryRecordsService(db);
    const page = await records.page(unitA, 'warehouses', {
      page: 1, pageSize: 20, sortDirection: 'ASC', filters: {},
    });
    expect(page.items.map((row) => row.id)).not.toContain(sibling.id);
    expect(await records.get(unitA, 'warehouses', sibling.id)).toBeNull();
    expect(await records.lookup(unitA, 'warehouses', { ids: [sibling.id], limit: 10 })).toEqual([]);
    expect((await inventory.resolveBarcode(unitA, 'SCAN-BIN-B')).entityType).toBe('UNKNOWN');
    expect((await inventory.resolveBarcode(principal, 'SCAN-BIN-B')).matchedEntityId).toBe(siblingLocation.id);
    await expect(records.updateWarehouse(unitA, sibling.id, { name: 'forbidden' }, sibling.version)).rejects.toThrow('outside your access');
    await expect(inventory.checkAtp(unitA, {
      requestKey: randomUUID(), warehouseId: sibling.id, productId, uomId,
      requestedQuantity: '1.000000',
    })).rejects.toThrow('outside your organization access');
  }, 30_000);
});
