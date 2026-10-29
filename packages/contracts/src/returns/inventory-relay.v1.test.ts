import { describe, expect, it } from 'vitest';
import { RmaReturnReceiptCommandV1Schema } from './inventory-relay.v1.js';

describe('RmaReturnReceiptCommandV1Schema', () => {
  it('rejects SCRAP on the inventory return command', () => {
    const parsed = RmaReturnReceiptCommandV1Schema.safeParse({
      commandKey: '11111111-1111-4111-8111-111111111111',
      dispositionId: '22222222-2222-4222-8222-222222222222',
      rmaId: '33333333-3333-4333-8333-333333333333',
      rmaLineId: '44444444-4444-4444-8444-444444444444',
      dispositionCode: 'SCRAP',
      warehouseId: '55555555-5555-4555-8555-555555555555',
      orgUnitId: 'UNIT-1',
      productId: '66666666-6666-4666-8666-666666666666',
      uomId: '77777777-7777-4777-a777-777777777777',
      quantity: '1.000000',
    });
    expect(parsed.success).toBe(false);
  });
});
