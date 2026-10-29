import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000013_landed_cost_adjustment_projection.up.sql'), 'utf8');

describe('Inventory migration 000013 landed cost adjustment projection', () => {
  it('creates append-only landed cost adjustment rows keyed by finance layer', () => {
    expect(upSql).toContain('inventory_landed_cost_adjustments');
    expect(upSql).toMatch(/finance_cost_layer_id/);
    expect(upSql).toMatch(/prevent_landed_cost_adjustment_mutation/);
  });
});
