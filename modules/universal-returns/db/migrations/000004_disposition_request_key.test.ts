import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000004_disposition_request_key migration', () => {
  it('adds request_key uniqueness for dispositions', () => {
    const sql = readFileSync(join(dir, '000004_disposition_request_key.up.sql'), 'utf8');
    expect(sql).toContain('request_key');
    expect(sql).toContain('dispositions_tenant_request_key');
  });
});
