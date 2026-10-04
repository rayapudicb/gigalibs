import { describe, it, expect } from 'vitest';
import {
  ExactDecimal,
  OrdersAllocationRequestedV1Schema,
  InventoryReservationConfirmedV1Schema,
  InventoryReservationRejectedV1Schema,
  InventoryStockIssuedV1Schema,
  InventoryReceiptCompletedV1Schema,
  OrdersFulfillmentDispatchedV1Schema,
  ArInvoiceIssuedV1Schema,
} from './commercial-operational.js';

describe('ExactDecimal utility', () => {
  it('converts decimal strings to scaled BigInt and back without precision loss', () => {
    expect(ExactDecimal.toScaledBigInt('123.456789')).toBe(123456789n);
    expect(ExactDecimal.toScaledBigInt('0.000001')).toBe(1n);
    expect(ExactDecimal.toScaledBigInt('100')).toBe(100000000n);
    expect(ExactDecimal.toScaledBigInt('-50.25')).toBe(-50250000n);

    expect(ExactDecimal.fromScaledBigInt(123456789n)).toBe('123.456789');
    expect(ExactDecimal.fromScaledBigInt(1n)).toBe('0.000001');
    expect(ExactDecimal.fromScaledBigInt(100000000n)).toBe('100.000000');
    expect(ExactDecimal.fromScaledBigInt(-50250000n)).toBe('-50.250000');
  });

  it('performs exact addition and subtraction', () => {
    const a = '100.500000';
    const b = '25.250000';
    expect(ExactDecimal.add(a, b)).toBe('125.750000');
    expect(ExactDecimal.subtract(a, b)).toBe('75.250000');
  });

  it('performs exact multiplication without IEEE 754 float drift', () => {
    // 0.1 * 0.2 = 0.02
    const res = ExactDecimal.multiply('0.100000', '0.200000');
    expect(res).toBe('0.020000');
  });

  it('compares decimal values deterministically', () => {
    expect(ExactDecimal.compare('10.000000', '9.999999')).toBe(1);
    expect(ExactDecimal.compare('9.999999', '10.000000')).toBe(-1);
    expect(ExactDecimal.compare('10.000000', '10.000000')).toBe(0);
    expect(ExactDecimal.isLessThanOrEqual('5.000000', '5.000000')).toBe(true);
    expect(ExactDecimal.isGreaterThan('5.000001', '5.000000')).toBe(true);
  });
});

describe('Commercial & Operational Handshake Schemas', () => {
  it('validates OrdersAllocationRequestedV1Schema', () => {
    const valid = {
      allocationKey: 'a0000000-0000-4000-a000-000000000001',
      orderId: 'b0000000-0000-4000-a000-000000000001',
      orderLineId: 'c0000000-0000-4000-a000-000000000001',
      productId: 'd0000000-0000-4000-a000-000000000001',
      warehouseId: 'e0000000-0000-4000-a000-000000000001',
      requestedQuantity: '15.500000',
      uomId: 'f0000000-0000-4000-a000-000000000001',
    };
    expect(OrdersAllocationRequestedV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates InventoryReservationConfirmedV1Schema', () => {
    const valid = {
      allocationKey: 'a0000000-0000-4000-a000-000000000001',
      reservationId: 'b0000000-0000-4000-a000-000000000001',
      orderId: 'c0000000-0000-4000-a000-000000000001',
      orderLineId: 'd0000000-0000-4000-a000-000000000001',
      productId: 'e0000000-0000-4000-a000-000000000001',
      warehouseId: 'f0000000-0000-4000-a000-000000000001',
      reservedQuantity: '15.500000',
      reservedAt: '2026-10-04T10:00:00.000Z',
    };
    expect(InventoryReservationConfirmedV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates InventoryReservationRejectedV1Schema', () => {
    const valid = {
      allocationKey: 'a0000000-0000-4000-a000-000000000001',
      orderId: 'c0000000-0000-4000-a000-000000000001',
      orderLineId: 'd0000000-0000-4000-a000-000000000001',
      productId: 'e0000000-0000-4000-a000-000000000001',
      warehouseId: 'f0000000-0000-4000-a000-000000000001',
      requestedQuantity: '50.000000',
      availableStock: '20.000000',
      reason: 'Insufficient stock in warehouse',
    };
    expect(InventoryReservationRejectedV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates InventoryStockIssuedV1Schema', () => {
    const valid = {
      issueId: 'a0000000-0000-4000-a000-000000000001',
      reservationId: 'b0000000-0000-4000-a000-000000000001',
      orderId: 'c0000000-0000-4000-a000-000000000001',
      orderLineId: 'd0000000-0000-4000-a000-000000000001',
      productId: 'e0000000-0000-4000-a000-000000000001',
      warehouseId: 'f0000000-0000-4000-a000-000000000001',
      issuedQuantity: '15.500000',
      issuedAt: '2026-10-04T10:00:00.000Z',
    };
    expect(InventoryStockIssuedV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates InventoryReceiptCompletedV1Schema', () => {
    const valid = {
      receiptId: 'a0000000-0000-4000-a000-000000000001',
      receiptNumber: 'REC-2026-0001',
      warehouseId: 'b0000000-0000-4000-a000-000000000001',
      receivedAt: '2026-10-04T10:00:00.000Z',
      lines: [
        {
          receiptLineId: 'c0000000-0000-4000-a000-000000000001',
          productId: 'd0000000-0000-4000-a000-000000000001',
          receivedQuantity: '100.000000',
          uomId: 'e0000000-0000-4000-a000-000000000001',
          purchaseOrderId: 'f0000000-0000-4000-a000-000000000001',
          purchaseOrderLineId: 'f0000000-0000-4000-a000-000000000002',
        },
      ],
    };
    expect(InventoryReceiptCompletedV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates OrdersFulfillmentDispatchedV1Schema', () => {
    const valid = {
      fulfillmentId: 'a0000000-0000-4000-a000-000000000001',
      orderId: 'b0000000-0000-4000-a000-000000000001',
      orderNumber: 'SO-2026-0001',
      customerPartyId: 'c0000000-0000-4000-a000-000000000001',
      currencyCode: 'USD',
      issueId: 'd0000000-0000-4000-a000-000000000001',
      lines: [
        {
          orderLineId: 'e0000000-0000-4000-a000-000000000001',
          productId: 'f0000000-0000-4000-a000-000000000001',
          productCode: 'PROD-01',
          productName: 'Product One',
          quantity: '15.500000',
          unitPriceMinor: '2500',
          uomId: 'a0000000-0000-4000-a000-000000000002',
        },
      ],
      dispatchedAt: '2026-10-04T10:00:00.000Z',
    };
    expect(OrdersFulfillmentDispatchedV1Schema.safeParse(valid).success).toBe(true);
  });

  it('validates ArInvoiceIssuedV1Schema', () => {
    const valid = {
      invoiceId: 'a0000000-0000-4000-a000-000000000001',
      invoiceNumber: 'INV-2026-0001',
      orderId: 'b0000000-0000-4000-a000-000000000001',
      fulfillmentId: 'c0000000-0000-4000-a000-000000000001',
      customerPartyId: 'd0000000-0000-4000-a000-000000000001',
      totalAmountMinor: '38750',
      currencyCode: 'USD',
      sealHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sealSequence: 1,
      issuedAt: '2026-10-04T10:00:00.000Z',
    };
    expect(ArInvoiceIssuedV1Schema.safeParse(valid).success).toBe(true);
  });
});
