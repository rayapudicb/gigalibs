import { describe, it, expect } from 'vitest';
import {
  ORDER_TYPES,
  ORDER_STATUSES,
  ORDER_LINE_STATUSES,
  ORDER_ALLOCATION_STATUSES,
  FULFILLMENT_STATUSES,
  CUSTOMER_INVOICE_STATUSES,
  CreateSalesQuoteInputV1Schema,
  CreateSalesOrderInputV1Schema,
  CreateFulfillmentOrderInputV1Schema,
  CreateCustomerInvoiceInputV1Schema,
  SalesOrderCreatedEventV1Schema,
} from './orders.js';

describe('Order Management Contracts (Phase 7 / WI-OI-093)', () => {
  it('validates order statuses and types', () => {
    expect(ORDER_TYPES).toContain('STANDARD');
    expect(ORDER_TYPES).toContain('DIRECT_FULFILLMENT');
    expect(ORDER_TYPES).toContain('DROP_SHIP');
    expect(ORDER_STATUSES).toContain('CONFIRMED');
    expect(ORDER_STATUSES).toContain('FULFILLED');
    expect(ORDER_LINE_STATUSES).toContain('ALLOCATED');
    expect(ORDER_ALLOCATION_STATUSES).toContain('HARD_RESERVED');
    expect(FULFILLMENT_STATUSES).toContain('DELIVERED');
    expect(CUSTOMER_INVOICE_STATUSES).toContain('ISSUED');
  });

  it('validates CreateSalesQuoteInputV1 with strict schema', () => {
    const valid = {
      orgUnitId: 'org-sales-01',
      customerPartyId: 'a0000000-0000-4000-a000-000000000001',
      customerName: 'Global Manufacturing Corp',
      currencyCode: 'USD',
      validUntil: new Date().toISOString(),
      paymentTermDays: 30,
      lines: [
        {
          productId: 'b0000000-0000-4000-a000-000000000001',
          productCode: 'FG-WIDGET-01',
          productName: 'Precision Hydraulic Cylinder',
          quotedQuantity: '100',
          uomId: 'c0000000-0000-4000-a000-000000000001',
          unitPriceMinor: '45000',
          discountPercentBasisPoints: 500,
        },
      ],
    };

    const parsed = CreateSalesQuoteInputV1Schema.safeParse(valid);
    expect(parsed.success).toBe(true);

    const invalid = CreateSalesQuoteInputV1Schema.safeParse({ ...valid, extraField: 'rejected' });
    expect(invalid.success).toBe(false);
  });

  it('validates CreateSalesOrderInputV1 with strict schema', () => {
    const valid = {
      orgUnitId: 'org-sales-01',
      customerPartyId: 'a0000000-0000-4000-a000-000000000001',
      customerName: 'Global Manufacturing Corp',
      orderType: 'STANDARD',
      currencyCode: 'USD',
      warehouseId: 'd0000000-0000-4000-a000-000000000001',
      paymentTermDays: 30,
      lines: [
        {
          productId: 'b0000000-0000-4000-a000-000000000001',
          productCode: 'FG-WIDGET-01',
          productName: 'Precision Hydraulic Cylinder',
          orderedQuantity: '50',
          uomId: 'c0000000-0000-4000-a000-000000000001',
          unitPriceMinor: '45000',
          warehouseId: 'd0000000-0000-4000-a000-000000000001',
        },
      ],
    };

    const parsed = CreateSalesOrderInputV1Schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('validates CreateFulfillmentOrderInputV1 schema', () => {
    const valid = {
      orderId: 'e0000000-0000-4000-a000-000000000001',
      warehouseId: 'd0000000-0000-4000-a000-000000000001',
      carrier: 'Freightliner Express',
      trackingNumber: 'TRK-9876543210',
      lines: [
        {
          orderLineId: 'f0000000-0000-4000-a000-000000000001',
          shippedQuantity: '50',
          lotNumber: 'LOT-2026-Q4',
        },
      ],
    };

    const parsed = CreateFulfillmentOrderInputV1Schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('validates CreateCustomerInvoiceInputV1 schema', () => {
    const valid = {
      orderId: 'e0000000-0000-4000-a000-000000000001',
      dueDate: new Date().toISOString(),
      notes: 'Net 30 payment terms strictly enforced',
    };

    const parsed = CreateCustomerInvoiceInputV1Schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('validates SalesOrderCreatedEventV1Schema schema', () => {
    const event = {
      id: 'a0000000-0000-4000-a000-000000000001',
      tenantId: 'tenant-test-01',
      occurredAt: new Date().toISOString(),
      actorId: 'user-sales-01',
      type: 'sales-order.created.v1',
      data: {
        orderId: 'b0000000-0000-4000-a000-000000000001',
        orderNumber: 'SO-2026-0001',
        customerPartyId: 'c0000000-0000-4000-a000-000000000001',
        totalAmountMinor: '2250000',
        currencyCode: 'USD',
      },
    };

    const parsed = SalesOrderCreatedEventV1Schema.safeParse(event);
    expect(parsed.success).toBe(true);
  });
});
