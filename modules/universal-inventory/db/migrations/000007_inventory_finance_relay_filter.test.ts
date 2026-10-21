/** WI-OI-120bq M1/M2: migration 7 filtered lease and PUBLIC revoke. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000007_inventory_finance_relay_filter.up.sql'), 'utf8');

describe('Inventory migration 000007 Finance relay filter', () => {
  it('leases only inventory.receipt.completed.v1 and revokes PUBLIC execute', () => {
    expect(upSql).toMatch(/event_type = 'inventory\.receipt\.completed\.v1'/);
    expect(upSql).toMatch(/REVOKE ALL ON FUNCTION gigalibs_inventory\.relay_lease_inventory_events\(integer, integer\) FROM PUBLIC/);
    expect(upSql).toMatch(/GRANT EXECUTE ON FUNCTION gigalibs_inventory\.relay_lease_inventory_events\(integer, integer\) TO gigalibs_inventory_runtime/);
    expect(upSql).toMatch(/schema_migrations \(version, name\)/);
  });
});
