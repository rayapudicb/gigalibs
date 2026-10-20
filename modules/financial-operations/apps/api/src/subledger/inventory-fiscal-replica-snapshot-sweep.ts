import type { DatabaseService } from '../database.service.js';
import { publishPendingInventoryFiscalReplicaSnapshots } from './finance-inventory-outbox.js';

export type InventoryFiscalReplicaSnapshotSweepResult = {
  readonly tenantsPublished: number;
};

/** WI-OI-120bp B4: publish fiscal replica snapshots for tenants that have periods but no publish marker yet. */
export async function runInventoryFiscalReplicaSnapshotSweep(
  database: Pick<DatabaseService, 'relayCall' | 'withTenantTransaction'>,
): Promise<InventoryFiscalReplicaSnapshotSweepResult> {
  const rows = await database.relayCall<{ tenant_id: string }>(
    'list_tenants_pending_inventory_fiscal_replica_snapshot',
    [],
  );
  let tenantsPublished = 0;
  for (const row of rows) {
    const tenantId = row.tenant_id;
    if (!tenantId) continue;
    const published = await database.withTenantTransaction(tenantId, (client) =>
      publishPendingInventoryFiscalReplicaSnapshots(client, tenantId),
    );
    if (published) tenantsPublished += 1;
  }
  return { tenantsPublished };
}
