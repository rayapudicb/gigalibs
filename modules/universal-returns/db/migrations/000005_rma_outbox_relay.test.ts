import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000005_rma_outbox_relay migration', () => {
  it('leases credit-memo and scrap events separately', () => {
    const sql = readFileSync(join(dir, '000005_rma_outbox_relay.up.sql'), 'utf8');
    expect(sql).toContain('returns.rma.credit_memo_requested.v1');
    expect(sql).toContain('returns.rma.scrap_gl_requested.v1');
    expect(sql).toContain('relay_settle_returns_event');
  });
});
