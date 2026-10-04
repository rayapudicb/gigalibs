import { describe, it, expect } from 'vitest';
import {
  REQUISITION_STATUSES,
  RequisitionStatusSchema,
  PURCHASE_ORDER_STATUSES,
  PurchaseOrderStatusSchema,
  MatchPoReceiptRecordV1Schema,
  MatchPoInvoiceRecordV1Schema,
  CreateRequisitionInputV1Schema,
  CreatePurchaseOrderInputV1Schema,
  CreateVendorBillInputV1Schema,
  PurchaseOrderIssuedEventV1Schema,
} from './procurement.js';


describe('Procurement Contracts (Phase 6 / WI-OI-092)', () => {
  it('validates requisition statuses correctly', () => {
    expect(REQUISITION_STATUSES).toContain('DRAFT');
    expect(REQUISITION_STATUSES).toContain('SUBMITTED');
    expect(REQUISITION_STATUSES).toContain('APPROVED');
    expect(RequisitionStatusSchema.safeParse('APPROVED').success).toBe(true);
    expect(RequisitionStatusSchema.safeParse('INVALID').success).toBe(false);
  });

  it('validates purchase order statuses correctly', () => {
    expect(PURCHASE_ORDER_STATUSES).toContain('DRAFT');
    expect(PURCHASE_ORDER_STATUSES).toContain('ISSUED');
    expect(PURCHASE_ORDER_STATUSES).toContain('ACKNOWLEDGED');
    expect(PurchaseOrderStatusSchema.safeParse('ISSUED').success).toBe(true);
  });

  it('validates CreateRequisitionInputV1 with strict schema', () => {
    const valid = {
      orgUnitId: 'org-mfg-plant-1',
      description: 'Monthly Maintenance Spares',
      currencyCode: 'USD',
      lines: [
        {
          productId: '123e4567-e89b-12d3-a456-426614174000',
          productCode: 'BEARING-6205',
          productName: 'Deep Groove Ball Bearing',
          quantity: '50.000000',
          uomId: '223e4567-e89b-12d3-a456-426614174000',
          estimatedUnitPriceMinor: '1250',
        },
      ],
    };
    const parsed = CreateRequisitionInputV1Schema.safeParse(valid);
    expect(parsed.success).toBe(true);

    const withExtra = { ...valid, forbiddenProperty: 'evil' };
    expect(CreateRequisitionInputV1Schema.safeParse(withExtra).success).toBe(false);
  });

  it('validates CreatePurchaseOrderInputV1 with strict schema', () => {
    const valid = {
      orgUnitId: 'org-mfg-plant-1',
      vendorPartyId: '323e4567-e89b-12d3-a456-426614174000',
      vendorName: 'SKF Industrial Bearings Inc.',
      currencyCode: 'USD',
      destinationWarehouseId: '423e4567-e89b-12d3-a456-426614174000',
      lines: [
        {
          productId: '123e4567-e89b-12d3-a456-426614174000',
          productCode: 'BEARING-6205',
          productName: 'Deep Groove Ball Bearing',
          orderedQuantity: '50.000000',
          uomId: '223e4567-e89b-12d3-a456-426614174000',
          unitPriceMinor: '1200',
          destinationWarehouseId: '423e4567-e89b-12d3-a456-426614174000',
        },
      ],
    };
    const parsed = CreatePurchaseOrderInputV1Schema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('validates 3-way match record schemas', () => {
    const now = new Date().toISOString();
    const matchReceipt = {
      id: '523e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-test',
      purchaseOrderId: '623e4567-e89b-12d3-a456-426614174000',
      purchaseOrderLineId: '723e4567-e89b-12d3-a456-426614174000',
      receiptId: '823e4567-e89b-12d3-a456-426614174000',
      receiptLineId: '923e4567-e89b-12d3-a456-426614174000',
      matchedQuantity: '50.000000',
      uomId: '223e4567-e89b-12d3-a456-426614174000',
      matchedBy: 'user-receiving-lead',
      matchedAt: now,
      status: 'FULLY_MATCHED' as const,
      createdAt: now,
    };
    expect(MatchPoReceiptRecordV1Schema.safeParse(matchReceipt).success).toBe(true);

    const matchInvoice = {
      id: 'a23e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-test',
      purchaseOrderId: '623e4567-e89b-12d3-a456-426614174000',
      purchaseOrderLineId: '723e4567-e89b-12d3-a456-426614174000',
      vendorBillId: 'b23e4567-e89b-12d3-a456-426614174000',
      vendorBillLineId: 'c23e4567-e89b-12d3-a456-426614174000',
      matchedQuantity: '50.000000',
      poUnitPriceMinor: '1200',
      billedUnitPriceMinor: '1200',
      priceVarianceMinor: '0',
      priceVariancePercent: 0,
      status: 'FULLY_MATCHED' as const,
      toleranceExceeded: false,
      matchedBy: 'user-ap-clerk',
      matchedAt: now,
      createdAt: now,
    };
    expect(MatchPoInvoiceRecordV1Schema.safeParse(matchInvoice).success).toBe(true);
  });

  it('validates outbox event schemas', () => {
    const event = {
      eventId: 'd23e4567-e89b-12d3-a456-426614174000',
      tenantId: 'tenant-test',
      occurredAt: new Date().toISOString(),
      schemaVersion: 1 as const,
      type: 'procurement.order.issued.v1' as const,
      data: {
        purchaseOrderId: '623e4567-e89b-12d3-a456-426614174000',
        orderNumber: 'PO-2026-0001',
        vendorPartyId: '323e4567-e89b-12d3-a456-426614174000',
        totalAmountMinor: '60000',
        currencyCode: 'USD',
      },
    };
    expect(PurchaseOrderIssuedEventV1Schema.safeParse(event).success).toBe(true);
  });

  it('validates vendor bill and input schemas', () => {
    const billInput = {
      vendorPartyId: '323e4567-e89b-12d3-a456-426614174000',
      vendorInvoiceNumber: 'INV-999',
      invoiceDate: new Date().toISOString(),
      dueDate: new Date().toISOString(),
      currencyCode: 'USD',
      purchaseOrderId: '623e4567-e89b-12d3-a456-426614174000',
      lines: [
        {
          description: 'Industrial Sensor',
          billedQuantity: '10.000000',
          uomId: '223e4567-e89b-12d3-a456-426614174000',
          unitPriceMinor: '1200',
          lineTaxMinor: '0',
        },
      ],
    };
    expect(CreateVendorBillInputV1Schema.safeParse(billInput).success).toBe(true);
  });
});

