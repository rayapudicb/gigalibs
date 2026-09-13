import { describe, expect, it } from 'vitest';
import { decodeCustomerCursor, decodeInvoiceCursor, encodeCursor } from './pagination.js';

describe('keyset pagination cursors', () => {
  it('round-trips customer and invoice positions', () => {
    const customer = { n: 'Acme', i: '10000000-0000-4000-8000-000000000001' };
    const invoice = {
      u: '2026-09-04T10:00:00.000Z',
      i: '20000000-0000-4000-8000-000000000002',
    };
    expect(decodeCustomerCursor(encodeCursor(customer))).toEqual(customer);
    expect(decodeInvoiceCursor(encodeCursor(invoice))).toEqual(invoice);
  });

  it.each(['', '***', Buffer.from('{}').toString('base64url')])(
    'rejects malformed cursor %s',
    (cursor) => {
      expect(() => decodeCustomerCursor(cursor)).toThrow('Cursor is invalid');
    },
  );
});
