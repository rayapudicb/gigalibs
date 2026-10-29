import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000018_finance_project_wip_accounts migration', () => {
  it('adds project WIP GL columns on cost_profiles', () => {
    const sql = readFileSync(join(dir, '000018_finance_project_wip_accounts.up.sql'), 'utf8');
    expect(sql).toContain('project_wip_gl_account_id');
    expect(sql).toContain('project_labor_expense_gl_account_id');
  });
});
