/** WI-OI-120bp / M1: migration 12 must not leave the new relay lease callable by PUBLIC. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000012_finance_inventory_outbound_relay.up.sql'), 'utf8');

describe('Finance migration 000012 relay privileges', () => {
  it('revokes PUBLIC execute and grants only gigalibs_finance_runtime', () => {
    expect(upSql).toMatch(
      /REVOKE ALL ON FUNCTION gigalibs_finance\.relay_lease_finance_inventory_events\(integer, integer\) FROM PUBLIC/,
    );
    expect(upSql).toMatch(
      /GRANT EXECUTE ON FUNCTION gigalibs_finance\.relay_lease_finance_inventory_events\(integer, integer\)\s+TO gigalibs_finance_runtime/,
    );
  });
});
