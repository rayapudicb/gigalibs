/** WI-OI-124: migration 10 cost layers and RLS. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000010_material_ledger_cost_layers.up.sql'), 'utf8');

describe('Inventory migration 000010 Material Ledger cost layers', () => {
  it('creates append-only cost layers mirrored from ledger debits', () => {
    expect(upSql).toContain('inventory_cost_layers');
    expect(upSql).toContain('mirror_ledger_entry_to_cost_layer');
    expect(upSql).toContain('prevent_cost_layer_mutation');
    expect(upSql).toContain('inventory_org_valuation_settings');
    expect(upSql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(upSql).toContain("VALUES (10, '000010_material_ledger_cost_layers')");
  });
});
