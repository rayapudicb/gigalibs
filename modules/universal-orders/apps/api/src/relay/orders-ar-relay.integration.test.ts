import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startThrowawayPostgres, type ThrowawayPostgres } from '../../scripts/throwaway-postgres.js';
import { DatabaseService } from '../database.service.js';

describe.skipIf(process.env.ORDERS_AR_RELAY_PG_PROOF !== '1')('Orders AR relay lease on isolated PostgreSQL', () => {
  let postgres: ThrowawayPostgres;
  let database: DatabaseService;
  const tenantId = 'tenant-orders-ar-proof';

  beforeAll(async () => {
    postgres = await startThrowawayPostgres(`gigalibs-orders-ar-relay-${process.pid}`);
    database = new DatabaseService({ databaseUrl: postgres.runtimeUrl, databasePoolSize: 3,
      expectedMigrationVersion: 5, platformContextAudience: 'proof', platformContextPublicKey: 'proof',
      corsOrigins: [], apiHost: '127.0.0.1', apiPort: 0 } as never);
    await database.onModuleInit();
  }, 45_000);

  afterAll(async () => {
    await database?.onModuleDestroy();
    postgres?.stop();
  });

  it('leases dispatched fulfillments and leaves other Orders facts pending', async () => {
    const fulfillmentId = randomUUID();
    const allocationId = randomUUID();
    await database.withTenantTransaction(tenantId, async (client) => {
      for (const [id, type] of [
        [fulfillmentId, 'orders.fulfillment.dispatched.v1'],
        [allocationId, 'orders.allocation.requested.v1'],
      ]) {
        await client.query(`INSERT INTO gigalibs_orders.outbox_events
          (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version,
           correlation_id, schema_version, payload) VALUES
          ($1, $2, 'orders.fulfillment', $3, 'proof', $1, 1, $1, 1, '{}'::jsonb)`, [id, tenantId, type]);
      }
    });
    const leased = await database.relayCall<{ id: string; event_type: string }>('relay_lease_ar_fulfillments', [20, 60]);
    expect(leased.map((row) => [row.id, row.event_type])).toEqual([[fulfillmentId, 'orders.fulfillment.dispatched.v1']]);
    await database.withTenantTransaction(tenantId, async (client) => {
      const rows = await client.query<{ id: string; status: string }>(
        `SELECT id, status FROM gigalibs_orders.outbox_events WHERE tenant_id = $1`, [tenantId]);
      expect(rows.rows.find((row) => row.id === allocationId)?.status).toBe('PENDING');
    });
  });
});
