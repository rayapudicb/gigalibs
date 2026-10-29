import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';

const enabled = process.env.INVENTORY_PG_PROOF === '1';

describe.skipIf(!enabled)('Material Ledger version 9 to 10 upgrade on isolated PostgreSQL', () => {
  let postgres: ThrowawayPostgres;
  let admin: pg.Client;
  const tenantId = 'legacy-upgrade-proof';
  const warehouseId = randomUUID();
  const exactReservationId = randomUUID();
  const ambiguousReservationId = randomUUID();
  const exactBalanceId = randomUUID();
  const exactProductId = randomUUID();
  const ambiguousProductId = randomUUID();
  const uomId = randomUUID();

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-inv-upgrade-${process.pid}`, async (client, migrationName) => {
      if (!migrationName.startsWith('000010_')) return;
      await client.query(
        `INSERT INTO gigalibs_inventory.warehouses
           (id, tenant_id, code, name, warehouse_type, org_unit_id, created_by, updated_by)
         VALUES ($1, $2, 'WH-LEGACY', 'Legacy upgrade warehouse', 'PHYSICAL', 'unit-a', 'proof', 'proof')`,
        [warehouseId, tenantId],
      );
      const exactLocationId = randomUUID();
      const ambiguousLocationIds = [randomUUID(), randomUUID()];
      for (const [index, id] of [exactLocationId, ...ambiguousLocationIds].entries()) {
        await client.query(
          `INSERT INTO gigalibs_inventory.locations
             (id, tenant_id, warehouse_id, code, name, location_type)
           VALUES ($1, $2, $3, $4, $4, 'STORAGE')`,
          [id, tenantId, warehouseId, `BIN-${index + 1}`],
        );
      }
      await client.query(
        `INSERT INTO gigalibs_inventory.stock_balances
           (id, tenant_id, warehouse_id, location_id, product_id, uom_id,
            on_hand_quantity, reserved_quantity, available_quantity)
         VALUES ($1, $2, $3, $4, $5, $6, 10, 4, 6)`,
        [exactBalanceId, tenantId, warehouseId, exactLocationId, exactProductId, uomId],
      );
      for (const id of ambiguousLocationIds) {
        await client.query(
          `INSERT INTO gigalibs_inventory.stock_balances
             (id, tenant_id, warehouse_id, location_id, product_id, uom_id,
              on_hand_quantity, reserved_quantity, available_quantity)
           VALUES ($1, $2, $3, $4, $5, $6, 10, 2, 8)`,
          [randomUUID(), tenantId, warehouseId, id, ambiguousProductId, uomId],
        );
      }
      for (const [reservationId, productId, locationId] of [
        [exactReservationId, exactProductId, exactLocationId],
        [ambiguousReservationId, ambiguousProductId, null],
      ] as const) {
        await client.query(
          `INSERT INTO gigalibs_inventory.inventory_reservations
             (id, tenant_id, reservation_type, demand_type, demand_reference_id,
              warehouse_id, location_id, product_id, uom_id, quantity)
           VALUES ($1, $2, 'HARD', 'SALES_ORDER', $3, $4, $5, $6, $7, 4)`,
          [reservationId, tenantId, randomUUID(), warehouseId, locationId, productId, uomId],
        );
      }
    });
    admin = new pg.Client({ connectionString: postgres.adminUrl });
    await admin.connect();
  }, 120_000);

  afterAll(async () => {
    await admin?.end();
    postgres?.stop();
  });

  it('backfills one exact allocation and leaves ambiguous locator ownership for reconciliation', async () => {
    const rows = await admin.query<{
      reservation_id: string; balance_id: string; allocated_quantity: string;
    }>(
      `SELECT reservation_id, balance_id, allocated_quantity
         FROM gigalibs_inventory.inventory_reservation_allocations
        WHERE tenant_id = $1 ORDER BY reservation_id`,
      [tenantId],
    );
    expect(rows.rows).toEqual([{
      reservation_id: exactReservationId,
      balance_id: exactBalanceId,
      allocated_quantity: '4.000000',
    }]);
    expect(rows.rows.some((row) => row.reservation_id === ambiguousReservationId)).toBe(false);
  });

  it('keeps the migration version and new tables under forced tenant RLS', async () => {
    const version = await admin.query<{ version: string }>(
      'SELECT version FROM gigalibs_inventory.schema_migrations WHERE version = 10',
    );
    expect(version.rows[0]?.version).toBe('10');
    const tables = await admin.query<{ relname: string; relforcerowsecurity: boolean }>(
      `SELECT relname, relforcerowsecurity FROM pg_class
        WHERE oid IN ('gigalibs_inventory.inventory_reservation_allocations'::regclass,
                      'gigalibs_inventory.inventory_reservation_issues'::regclass,
                      'gigalibs_inventory.inventory_receipt_cost_records'::regclass)`,
    );
    expect(tables.rows).toHaveLength(3);
    expect(tables.rows.every((row) => row.relforcerowsecurity)).toBe(true);
  });
});
