import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000002_wbs_domain migration', () => {
  it('creates WBS tables with org unit on projects', () => {
    const sql = readFileSync(join(dir, '000002_wbs_domain.up.sql'), 'utf8');
    expect(sql).toContain('project_phases');
    expect(sql).toContain('project_tasks');
    expect(sql).toContain('timesheets');
    expect(sql).toContain('labor_rates');
    expect(sql).toContain('org_unit_id');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });
});
