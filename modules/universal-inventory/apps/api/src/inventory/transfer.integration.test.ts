import { randomUUID } from 'node:crypto';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';
import { DatabaseService } from '../database.service.js';
import { InventoryPostingCutoffService } from './inventory-posting-cutoff.service.js';
import { InventoryService } from './inventory.service.js';
import { TransferService } from './transfer.service.js';

const enabled = process.env.INVENTORY_PG_PROOF === '1';

describe.skipIf(!enabled)('Advanced SCM inter-warehouse transfer on isolated PostgreSQL', () => {
  let postgres: ThrowawayPostgres;
  let db: DatabaseService;
  let inventory: InventoryService;
  let transfers: TransferService;
  const tenantId = 'tenant-transfer';
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
  } as ModulePrincipal;

  const productId = randomUUID();
  const uomId = randomUUID();
  let sourceWh = '';
  let destWh = '';
  let sourceLoc = '';
  let destLoc = '';
  let transferId = '';

  const atp = async (warehouseId: string, requestedQuantity: string) =>
    (await inventory.checkAtp(principal, { requestKey: randomUUID(), warehouseId, productId, uomId, requestedQuantity })).decision;

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-inv-transfer-${process.pid}`);
    db = new DatabaseService({
      databaseUrl: postgres.runtimeUrl,
      databasePoolSize: 5,
      expectedMigrationVersion: 11,
      platformContextAudience: 'proof',
      platformContextPublicKey: 'proof',
      corsOrigins: [],
      apiHost: '127.0.0.1',
      apiPort: 0,
    } as never);
    inventory = new InventoryService(db, new InventoryPostingCutoffService());
    transfers = new TransferService(db);
    await db.onModuleInit();

    const source = await inventory.createWarehouse(principal, { code: 'WH-SRC', name: 'Source', warehouseType: 'PHYSICAL', orgUnitId: 'unit-a' });
    const dest = await inventory.createWarehouse(principal, { code: 'WH-DST', name: 'Destination', warehouseType: 'PHYSICAL', orgUnitId: 'unit-a' });
    sourceWh = source.id;
    destWh = dest.id;
    sourceLoc = (await inventory.createLocation(principal, { warehouseId: sourceWh, code: 'SRC-1', name: 'Source bin', locationType: 'STORAGE' })).id;
    destLoc = (await inventory.createLocation(principal, { warehouseId: destWh, code: 'DST-1', name: 'Dest bin', locationType: 'STORAGE' })).id;
    // Seed 10 available at the source directly, isolating the transfer from the receipt/finance path.
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_inventory.stock_balances (id, tenant_id, warehouse_id, location_id, product_id, uom_id, lot_id, serial_id, stock_status, on_hand_quantity, reserved_quantity, available_quantity, last_movement_at, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 'AVAILABLE', 10, 0, 10, now(), 1, now())`,
        [randomUUID(), tenantId, sourceWh, sourceLoc, productId, uomId],
      );
    });
  }, 60_000);

  afterAll(async () => {
    await db?.onModuleDestroy();
    postgres?.stop();
  });

  it('creates a draft inter-warehouse transfer', async () => {
    const transfer = await transfers.createTransfer(principal, {
      sourceWarehouseId: sourceWh,
      targetWarehouseId: destWh,
      lines: [{ productId, uomId, sourceLocationId: sourceLoc, targetLocationId: destLoc, quantity: '4.000000' }],
    });
    transferId = transfer.id;
    expect(transfer.status).toBe('DRAFT');
    expect(transfer.lines).toHaveLength(1);
    expect(await atp(sourceWh, '10.000000')).toBe('AVAILABLE');
    expect(await atp(destWh, '1.000000')).not.toBe('AVAILABLE');
  });

  it('refuses a transfer between the same warehouse', async () => {
    await expect(
      transfers.createTransfer(principal, {
        sourceWarehouseId: sourceWh,
        targetWarehouseId: sourceWh,
        lines: [{ productId, uomId, sourceLocationId: sourceLoc, targetLocationId: destLoc, quantity: '1.000000' }],
      }),
    ).rejects.toThrow();
  });

  it('dispatch removes stock from the source ATP and holds it in transit', async () => {
    const dispatched = await transfers.dispatchTransfer(principal, transferId);
    expect(dispatched.status).toBe('IN_TRANSIT');
    expect(dispatched.lines[0]?.pickedQuantity).toBe('4.000000');
    // 6 remain sellable at the source; the 4 in transit are BLOCKED, so 7 is no longer promisable.
    expect(await atp(sourceWh, '6.000000')).toBe('AVAILABLE');
    expect(await atp(sourceWh, '7.000000')).not.toBe('AVAILABLE');
    // Not yet at the destination.
    expect(await atp(destWh, '1.000000')).not.toBe('AVAILABLE');
  });

  it('replays an identical dispatch without moving stock twice', async () => {
    const replay = await transfers.dispatchTransfer(principal, transferId);
    expect(replay.status).toBe('IN_TRANSIT');
    expect(await atp(sourceWh, '6.000000')).toBe('AVAILABLE');
    expect(await atp(sourceWh, '7.000000')).not.toBe('AVAILABLE');
  });

  it('receipt makes the stock sellable at the destination', async () => {
    const received = await transfers.receiveTransfer(principal, transferId);
    expect(received.status).toBe('RECEIVED');
    expect(received.lines[0]?.receivedQuantity).toBe('4.000000');
    expect(await atp(destWh, '4.000000')).toBe('AVAILABLE');
    expect(await atp(destWh, '5.000000')).not.toBe('AVAILABLE');
    expect(await atp(sourceWh, '6.000000')).toBe('AVAILABLE');
    // The in-transit locator is emptied.
    const inTransit = await db.withTenantTransaction(tenantId, async (client) =>
      client.query<{ total: string }>(
        `SELECT coalesce(sum(on_hand_quantity), 0)::text AS total FROM gigalibs_inventory.stock_balances
          WHERE tenant_id = $1 AND stock_status = 'BLOCKED'`,
        [tenantId],
      ),
    );
    expect(Number(inTransit.rows[0]?.total)).toBe(0);
  });

  it('emits one GL in-transit clearance fact for dispatch and one for receipt', async () => {
    const facts = await db.withTenantTransaction(tenantId, async (client) =>
      client.query<{ event_type: string; aggregate_id: string }>(
        `SELECT event_type, aggregate_id FROM gigalibs_inventory.outbox_events
          WHERE tenant_id = $1 AND aggregate_type = 'transfer' AND status = 'PENDING'
          ORDER BY event_type`,
        [tenantId],
      ),
    );
    const types = facts.rows.map((row) => row.event_type);
    expect(types).toContain('inventory.transfer.dispatched.v1');
    expect(types).toContain('inventory.transfer.received.v1');
    // Exactly one of each, despite the idempotent dispatch/receipt replays.
    expect(types.filter((t) => t === 'inventory.transfer.dispatched.v1')).toHaveLength(1);
    expect(types.filter((t) => t === 'inventory.transfer.received.v1')).toHaveLength(1);
    expect(facts.rows.every((row) => row.aggregate_id === transferId)).toBe(true);
  });

  it('replays an identical receipt and refuses a second dispatch', async () => {
    const replay = await transfers.receiveTransfer(principal, transferId);
    expect(replay.status).toBe('RECEIVED');
    await expect(transfers.dispatchTransfer(principal, transferId)).rejects.toThrow();
  });
});
