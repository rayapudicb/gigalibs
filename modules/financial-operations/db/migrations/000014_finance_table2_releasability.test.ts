/** WI-OI-120bq: migration 14 adds inbox raw body, product standard costs, cutoff confirmations. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000014_finance_table2_releasability.up.sql'), 'utf8');

describe('Finance migration 000014 Table 2 releasability', () => {
  it('stores relay raw body and per-product standard costs', () => {
    expect(upSql).toMatch(/raw_body TEXT/);
    expect(upSql).toMatch(/product_standard_costs/);
    expect(upSql).toMatch(/inventory_posting_cutoff_confirmations/);
    expect(upSql).toMatch(/subledger_posting_retries/);
  });
});
