import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000003_project_wip_posting migration', () => {
  it('defines WIP accrual outbox relay and postings table', () => {
    const sql = readFileSync(join(dir, '000003_project_wip_posting.up.sql'), 'utf8');
    expect(sql).toContain('project_cost_postings');
    expect(sql).toContain('projects.wip_accrual_requested.v1');
    expect(sql).toContain('relay_settle_project_event');
  });
});
