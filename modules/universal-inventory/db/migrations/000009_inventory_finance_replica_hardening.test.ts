/** WI-OI-120bp review B2/B3: migration 9 RLS and state_version. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000009_inventory_finance_replica_hardening.up.sql'), 'utf8');

describe('Inventory migration 000009 Finance replica hardening', () => {
  it('forces RLS on Finance replica tables and adds state_version', () => {
    expect(upSql).toMatch(/finance_period_replica_meta[\s\S]*FORCE ROW LEVEL SECURITY/);
    expect(upSql).toMatch(/finance_fiscal_period_replica[\s\S]*FORCE ROW LEVEL SECURITY/);
    expect(upSql).toMatch(/state_version BIGINT/);
  });
});
