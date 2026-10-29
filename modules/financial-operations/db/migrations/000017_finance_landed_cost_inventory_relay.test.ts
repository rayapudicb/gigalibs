/** WI-OI-127: migration 17 extends Finance → Inventory relay for landed cost adjustments. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000017_finance_landed_cost_inventory_relay.up.sql'), 'utf8');

describe('Finance migration 000017 landed cost inventory relay', () => {
  it('leases finance.inventory.landed-cost-adjusted.v1 outbox events', () => {
    expect(upSql).toMatch(/finance\.inventory\.landed-cost-adjusted\.v1/);
    expect(upSql).toMatch(/relay_lease_finance_inventory_events/);
  });
});
