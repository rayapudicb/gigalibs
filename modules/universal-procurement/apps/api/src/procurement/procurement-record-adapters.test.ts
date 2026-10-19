import { describe, expect, it } from 'vitest';
import {
  windowValuesToCreateDebitMemoInput,
  windowValuesToCreatePurchaseOrderInput,
  windowValuesToCreateRequisitionInput,
  windowValuesToCreateVendorBillInput,
} from './procurement-record-adapters.js';

describe('windowValuesToCreateDebitMemoInput', () => {
  it('builds a one-line debit memo from window field keys', () => {
    const input = windowValuesToCreateDebitMemoInput({
      'vendor-id': '323e4567-e89b-12d3-a456-426614174000',
      reason: 'Price correction',
      'line-description': 'Returned overcharge',
      'line-quantity': '1.000000',
      'line-unit-price-minor': '900',
      'line-reason': 'Vendor pricing error',
    });
    expect(input.vendorPartyId).toBe('323e4567-e89b-12d3-a456-426614174000');
    expect(input.lines[0]?.reason).toBe('Vendor pricing error');
  });
});

describe('windowValuesToCreateRequisitionInput', () => {
  it('builds a one-line requisition from window field keys', () => {
    const input = windowValuesToCreateRequisitionInput({
      'org-unit-id': 'unit-1',
      description: 'Maintenance spares',
      'line-product-id': '660e8400-e29b-41d4-a716-446655440001',
      'line-product-code': 'SKU-1',
      'line-product-name': 'Widget',
      'line-quantity': '2.000000',
      'line-uom-id': '770e8400-e29b-41d4-a716-446655440002',
      'line-estimated-unit-price-minor': '500',
    });
    expect(input.orgUnitId).toBe('unit-1');
    expect(input.lines[0]?.estimatedUnitPriceMinor).toBe('500');
  });
});

describe('windowValuesToCreateVendorBillInput', () => {
  it('builds a one-line vendor bill from window field keys', () => {
    const input = windowValuesToCreateVendorBillInput({
      'vendor-id': '323e4567-e89b-12d3-a456-426614174000',
      'vendor-invoice-number': 'VINV-9001',
      'invoice-date': '2026-10-01T12:00:00.000Z',
      'due-date': '2026-11-01T12:00:00.000Z',
      'line-description': 'Maintenance supplies',
      'line-billed-quantity': '2.000000',
      'line-uom-id': '770e8400-e29b-41d4-a716-446655440002',
      'line-unit-price-minor': '1200',
    });
    expect(input.vendorInvoiceNumber).toBe('VINV-9001');
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0]?.unitPriceMinor).toBe('1200');
  });
});

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
