import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000004_project_billing_ar migration', () => {
  it('persists billing requests and AR relay lease', () => {
    const sql = readFileSync(join(dir, '000004_project_billing_ar.up.sql'), 'utf8');
    expect(sql).toContain('project_billing_requests');
    expect(sql).toContain('relay_lease_project_ar_events');
    expect(sql).toContain('projects.invoice_draft_requested.v1');
  });
});
