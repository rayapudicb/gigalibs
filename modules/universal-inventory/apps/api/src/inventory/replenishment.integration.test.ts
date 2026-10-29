import { randomUUID } from 'node:crypto';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';
import { DatabaseService } from '../database.service.js';
import { InventoryPostingCutoffService } from './inventory-posting-cutoff.service.js';
import { InventoryService } from './inventory.service.js';
import { ReplenishmentService } from './replenishment.service.js';

const enabled = process.env.INVENTORY_PG_PROOF === '1';

describe.skipIf(!enabled)('Advanced SCM replenishment radar and PO drafts on isolated PostgreSQL', () => {
  let postgres: ThrowawayPostgres;
  let db: DatabaseService;
  let inventory: InventoryService;
  let replenishment: ReplenishmentService;
  const tenantId = 'tenant-replenish';
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

  const lowProduct = randomUUID();
  const okProduct = randomUUID();
  const uomId = randomUUID();
  let warehouseId = '';

  const seedStock = async (productId: string, available: string, locationId: string) =>
    db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_inventory.stock_balances (id, tenant_id, warehouse_id, location_id, product_id, uom_id, lot_id, serial_id, stock_status, on_hand_quantity, reserved_quantity, available_quantity, last_movement_at, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 'AVAILABLE', $7, 0, $7, now(), 1, now())`,
        [randomUUID(), tenantId, warehouseId, locationId, productId, uomId, available],
      );
    });

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-inv-replenish-${process.pid}`);
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
    replenishment = new ReplenishmentService(db);
    await db.onModuleInit();

    warehouseId = (await inventory.createWarehouse(principal, { code: 'WH-RPL', name: 'Replenish WH', warehouseType: 'PHYSICAL', orgUnitId: 'unit-a' })).id;
    const loc = await inventory.createLocation(principal, { warehouseId, code: 'BIN-RPL', name: 'Bin', locationType: 'STORAGE' });
    await seedStock(lowProduct, '10.000000', loc.id); // below min
    await seedStock(okProduct, '50.000000', loc.id); // above min
  }, 60_000);

  afterAll(async () => {
    await db?.onModuleDestroy();
    postgres?.stop();
  });

  it('declares rules and updates them idempotently', async () => {
    const created = await replenishment.upsertRule(principal, { warehouseId, productId: lowProduct, minQuantity: '20', maxQuantity: '100', packSize: '12' });
    expect(created.version).toBe(1);
    const updated = await replenishment.upsertRule(principal, { warehouseId, productId: lowProduct, minQuantity: '20', maxQuantity: '100', packSize: '12' });
    expect(updated.version).toBe(2);
    expect(updated.id).toBe(created.id);
    await replenishment.upsertRule(principal, { warehouseId, productId: okProduct, minQuantity: '20', maxQuantity: '80', packSize: '10' });
    expect((await replenishment.listRules(principal, warehouseId))).toHaveLength(2);
  });

  it('the radar suggests a pack-rounded order only for products below min', async () => {
    const radar = await replenishment.computeRadar(principal, warehouseId);
    const low = radar.find((s) => s.productId === lowProduct);
    const ok = radar.find((s) => s.productId === okProduct);
    // need = 100 - 10 = 90; ceil(90 / 12) = 8 packs = 96.
    expect(low?.shouldReplenish).toBe(true);
    expect(low?.suggestedQuantity).toBe('96.000000');
    expect(low?.packs).toBe('8.000000');
    expect(ok?.shouldReplenish).toBe(false);
  });

  it('generates a PO-draft outbox fact for the product that needs it, and skips the one that does not', async () => {
    const drafts = await replenishment.generatePurchaseDrafts(principal, { warehouseId, productIds: [lowProduct, okProduct] });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.productId).toBe(lowProduct);
    expect(drafts[0]?.quantity).toBe('96.000000');

    const facts = await db.withTenantTransaction(tenantId, async (client) =>
      client.query<{ payload: { productId: string; quantity: string } }>(
        `SELECT payload FROM gigalibs_inventory.outbox_events
          WHERE tenant_id = $1 AND event_type = 'inventory.replenishment.po-draft.v1' AND status = 'PENDING'`,
        [tenantId],
      ),
    );
    expect(facts.rows).toHaveLength(1);
    expect(facts.rows[0]?.payload.productId).toBe(lowProduct);
    expect(facts.rows[0]?.payload.quantity).toBe('96.000000');
  });
});
