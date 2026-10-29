import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import {
  FINANCE_INVENTORY_LANDED_COST_ADJUSTED_V1,
  FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1,
} from '@gigalibs/contracts';
import { DatabaseService } from '../database.service.js';
import { FinanceInventoryInboxService } from '../relay/finance-inbox.service.js';
import { InventoryPostingCutoffService } from './inventory-posting-cutoff.service.js';
import { InventoryService } from './inventory.service.js';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';

const enabled = process.env.INVENTORY_LANDED_COST_PG_PROOF === '1';

describe.skipIf(!enabled)('Finance landed cost adjustment projection on isolated PostgreSQL', () => {
  let postgres: ThrowawayPostgres;
  let db: DatabaseService;
  let inventory: InventoryService;
  const tenantId = 'tenant-landed-cost';
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
  const productId = randomUUID();
  const uomId = randomUUID();
  const financeLayerId = randomUUID();
  let receiptId = '';
  let receiptLineId = '';

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-inv-landed-${process.pid}`);
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

  it('projects landed cost true-up after Finance receipt posting outcome', async () => {
    const wh = await inventory.createWarehouse(principal, {
      code: 'WH-LC',
      name: 'Landed cost WH',
      warehouseType: 'PHYSICAL',
      orgUnitId: 'unit-lc',
    });
    warehouseId = wh.id;
    await db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_inventory.inventory_org_valuation_settings
           (tenant_id, org_unit_id, valuation_method, finance_cost_profile_id, updated_by)
         VALUES ($1, 'unit-lc', 'FIFO', $2, 'proof-user')`,
        [tenantId, randomUUID()],
      );
    });
    const loc = await inventory.createLocation(principal, {
      warehouseId,
      code: 'BIN-LC',
      name: 'Landed bin',
      locationType: 'STORAGE',
    });
    locationId = loc.id;
    const receipt = await inventory.createReceipt(principal, {
      warehouseId,
      lines: [{ productId, uomId, expectedQuantity: '500.000000', targetLocationId: locationId }],
    });
    receiptId = receipt.id;
    await inventory.completeReceipt(principal, receipt.id);
    receiptLineId = await db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<{ id: string }>(
        'SELECT id FROM gigalibs_inventory.receipt_lines WHERE tenant_id = $1 AND receipt_id = $2',
        [tenantId, receipt.id],
      );
      return result.rows[0]!.id;
    });

    const inbox = new FinanceInventoryInboxService(db, new InventoryPostingCutoffService());
    const postingOutcome = {
      messageId: randomUUID(),
      tenantId,
      eventType: FINANCE_INVENTORY_RECEIPT_POSTING_OUTCOME_V1,
      aggregateType: 'INVENTORY_RECEIPT',
      aggregateId: receiptId,
      aggregateVersion: 1,
      correlationId: randomUUID(),
      causationId: null,
      schemaVersion: 1,
      payload: {
        receiptId,
        status: 'POSTED',
        costLines: [
          {
            receiptLineId,
            financeCostLayerId: financeLayerId,
            productId,
            quantity: '500.000000',
            valuationMethod: 'FIFO',
            unitCostScaled: '1000000000',
            totalCostMinor: '500000',
          },
        ],
      },
      occurredAt: new Date().toISOString(),
    };
    expect(await inbox.receive(postingOutcome, JSON.stringify(postingOutcome))).toEqual({ status: 'PROCESSED' });

    const landedCostId = randomUUID();
    const adjusted = {
      messageId: randomUUID(),
      tenantId,
      eventType: FINANCE_INVENTORY_LANDED_COST_ADJUSTED_V1,
      aggregateType: 'landed_cost',
      aggregateId: landedCostId,
      aggregateVersion: 1,
      correlationId: randomUUID(),
      causationId: null,
      schemaVersion: 1,
      payload: {
        landedCostId,
        voucherNumber: 'LC-PROOF-500',
        totalLandedCostMinor: '300000',
        adjustments: [
          {
            financeCostLayerId: financeLayerId,
            productId,
            apportionedAmountMinor: '300000',
            priorUnitCostScaled: '1000000000',
            adjustedUnitCostScaled: '1006000000',
          },
        ],
      },
      occurredAt: new Date().toISOString(),
    };
    expect(await inbox.receive(adjusted, JSON.stringify(adjusted))).toEqual({ status: 'PROCESSED' });
    expect(await inbox.receive(adjusted, JSON.stringify(adjusted))).toEqual({ status: 'DUPLICATE' });

    const rows = await db.withTenantTransaction(tenantId, async (client) =>
      client.query(
        `SELECT voucher_number, adjusted_unit_cost_scaled::text
           FROM gigalibs_inventory.inventory_landed_cost_adjustments
          WHERE tenant_id = $1 AND finance_cost_layer_id = $2`,
        [tenantId, financeLayerId],
      ),
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ voucher_number: 'LC-PROOF-500', adjusted_unit_cost_scaled: '1006000000' });
  }, 90_000);
});
