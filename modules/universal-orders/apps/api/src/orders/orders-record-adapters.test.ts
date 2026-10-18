import { describe, expect, it } from 'vitest';
import { windowValuesToCreateSalesOrderInput, windowValuesToCreateSalesQuoteInput } from './orders-record-adapters.js';

describe('windowValuesToCreateSalesQuoteInput', () => {
  it('builds a one-line sales quote from window field keys', () => {
    const input = windowValuesToCreateSalesQuoteInput({
      'org-unit-id': 'unit-1',
      'customer-id': '323e4567-e89b-12d3-a456-426614174000',
      'customer-name': 'Acme Industrial',
      'valid-until': '2026-12-31T23:59:59.000Z',
      'line-product-id': '660e8400-e29b-41d4-a716-446655440001',
      'line-product-code': 'SKU-1',
      'line-product-name': 'Widget',
      'line-quoted-quantity': '2.000000',
      'line-uom-id': '770e8400-e29b-41d4-a716-446655440002',
      'line-unit-price-minor': '500',
    });
    expect(input.orgUnitId).toBe('unit-1');
    expect(input.lines).toHaveLength(1);
    expect(input.validUntil).toBe('2026-12-31T23:59:59.000Z');
    expect(input.lines[0]?.unitPriceMinor).toBe('500');
  });
});

describe('windowValuesToCreateSalesOrderInput', () => {
  it('builds a one-line sales order from window field keys', () => {
    const input = windowValuesToCreateSalesOrderInput({
      'org-unit-id': 'unit-1',
      'customer-id': '323e4567-e89b-12d3-a456-426614174000',
      'customer-name': 'Acme Industrial',
      'warehouse-id': '550e8400-e29b-41d4-a716-446655440000',
      'line-product-id': '660e8400-e29b-41d4-a716-446655440001',
      'line-product-code': 'SKU-1',
      'line-product-name': 'Widget',
      'line-ordered-quantity': '2.000000',
      'line-uom-id': '770e8400-e29b-41d4-a716-446655440002',
      'line-unit-price-minor': '500',
    });
    expect(input.orgUnitId).toBe('unit-1');
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]?.warehouseId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(input.lines[0]?.unitPriceMinor).toBe('500');
  });
});
