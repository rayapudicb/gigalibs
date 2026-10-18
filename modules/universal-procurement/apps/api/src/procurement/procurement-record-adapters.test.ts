import { describe, expect, it } from 'vitest';
import { windowValuesToCreatePurchaseOrderInput } from './procurement-record-adapters.js';

describe('windowValuesToCreatePurchaseOrderInput', () => {
  it('builds a one-line purchase order from window field keys', () => {
    const input = windowValuesToCreatePurchaseOrderInput({
      'org-unit-id': 'unit-1',
      'vendor-id': '323e4567-e89b-12d3-a456-426614174000',
      'vendor-name': 'Acme Supply',
      'destination-warehouse-id': '550e8400-e29b-41d4-a716-446655440000',
      'line-product-id': '660e8400-e29b-41d4-a716-446655440001',
      'line-product-code': 'SKU-1',
      'line-product-name': 'Widget',
      'line-ordered-quantity': '2.000000',
      'line-uom-id': '770e8400-e29b-41d4-a716-446655440002',
      'line-unit-price-minor': '500',
    });
    expect(input.orgUnitId).toBe('unit-1');
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]?.destinationWarehouseId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(input.lines[0]?.unitPriceMinor).toBe('500');
  });
});
