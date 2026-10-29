import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000002_rma_domain.up.sql'), 'utf8');

describe('Universal Returns migration 000002 RMA domain', () => {
  it('creates RMA tables with qty guard and Orders return linkage', () => {
    expect(upSql).toContain('rma_types');
    expect(upSql).toMatch(/requested_quantity <= invoiced_quantity_cap/);
    expect(upSql).toMatch(/UNIQUE \(tenant_id, orders_return_id\)/);
    expect(upSql).toMatch(/FORCE ROW LEVEL SECURITY/);
  });
});
