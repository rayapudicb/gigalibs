/** WI-OI-120bq M1: migration 13 must REVOKE PUBLIC with correct function signatures. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000013_finance_table2_hardening.up.sql'), 'utf8');

describe('Finance migration 000013 relay privileges', () => {
  it('uses text id for relay_settle_finance_event (matches migration 1)', () => {
    expect(upSql).toMatch(
      /relay_settle_finance_event\(text, boolean, text, integer, integer\)/,
    );
    expect(upSql).not.toMatch(/relay_settle_finance_event\(uuid,/);
  });
});
