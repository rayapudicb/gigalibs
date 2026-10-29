import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationDir = dirname(fileURLToPath(import.meta.url));
const upSql = readFileSync(join(migrationDir, '000003_rma_document_actions.up.sql'), 'utf8');

describe('Universal Returns migration 000003 RMA document actions', () => {
  it('creates document_action_outcomes with tenant RLS', () => {
    expect(upSql).toContain('document_action_outcomes');
    expect(upSql).toMatch(/FORCE ROW LEVEL SECURITY/);
  });
});
