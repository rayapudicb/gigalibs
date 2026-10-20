/** WI-OI-120bq (M3): migration 8 relays posting-cutoff with receipt events. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000008_inventory_posting_cutoff_relay.up.sql'), 'utf8');

describe('Inventory migration 000008 posting-cutoff relay', () => {
  it('leases receipt completed and posting-cutoff event types', () => {
    expect(upSql).toMatch(/inventory\.receipt\.completed\.v1/);
    expect(upSql).toMatch(/inventory\.posting-cutoff\.v1/);
  });
});
