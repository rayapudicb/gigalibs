import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('000005_procurement_vendor_bill_credit_relay migration', () => {
  it('queues vendor bill OPEN_AP credit facts', () => {
    const sql = readFileSync(join(dir, '000005_procurement_vendor_bill_credit_relay.up.sql'), 'utf8');
    expect(sql).toContain('procurement.credit.vendor-bill-balance.v1');
    expect(sql).toContain('relay_lease_credit_vendor_bills');
  });
});
