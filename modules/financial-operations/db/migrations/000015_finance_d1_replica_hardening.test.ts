/** WI-OI-120bp review B2/B4/B5: migration 15 RLS, snapshot tenant list, relay lease. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000015_finance_d1_replica_hardening.up.sql'), 'utf8');
const up14Sql = readFileSync(join(migrationDir, '000014_finance_table2_releasability.up.sql'), 'utf8');

describe('Finance migration 000015 D1 replica hardening', () => {
  it('forces RLS on replica publish and Table 2 tenant tables', () => {
    expect(upSql).toMatch(/inventory_fiscal_replica_publish/);
    expect(upSql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(upSql).toMatch(/inventory_posting_cutoff_confirmations/);
    expect(upSql).toMatch(/subledger_posting_retries/);
    expect(up14Sql).toMatch(/inventory_posting_cutoff_confirmations[\s\S]*FORCE ROW LEVEL SECURITY/);
    expect(up14Sql).toMatch(/subledger_posting_retries[\s\S]*FORCE ROW LEVEL SECURITY/);
  });

  it('lists tenants pending snapshot and leases snapshot-completed events', () => {
    expect(upSql).toMatch(/list_tenants_pending_inventory_fiscal_replica_snapshot/);
    expect(upSql).toMatch(/finance\.fiscal-period\.snapshot-completed\.v1/);
  });
});
