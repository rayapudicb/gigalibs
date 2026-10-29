import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000019_ar_project_billing_source migration', () => {
  it('adds source_project_billing_id on invoices', () => {
    const sql = readFileSync(join(dir, '000019_ar_project_billing_source.up.sql'), 'utf8');
    expect(sql).toContain('source_project_billing_id');
  });
});
