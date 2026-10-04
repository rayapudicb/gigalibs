import { z } from 'zod';
import { CurrencyCodeSchema, DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';

// ─── Enums & Value Sets ────────────────────────────────────────────────────────

export const QUOTE_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ACCEPTED',
  'EXPIRED',
  'CONVERTED',
  'CANCELLED',
] as const;
export const QuoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const ORDER_TYPES = [
  'STANDARD',
  'DIRECT_FULFILLMENT',
  'DROP_SHIP',
  'CONTRACT',
  'RETURN_ORDER',
] as const;
export const OrderTypeSchema = z.enum(ORDER_TYPES);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'CONFIRMED',
  'PROCESSING',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'CLOSED',
  'CANCELLED',
] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const ORDER_LINE_STATUSES = [
  'OPEN',
  'ALLOCATED',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'CLOSED',
  'CANCELLED',
] as const;
export const OrderLineStatusSchema = z.enum(ORDER_LINE_STATUSES);
export type OrderLineStatus = z.infer<typeof OrderLineStatusSchema>;

export const ORDER_ALLOCATION_STATUSES = [
  'SOFT_ALLOCATED',
  'HARD_RESERVED',
  'RELEASED',
  'CONSUMED',
] as const;
export const OrderAllocationStatusSchema = z.enum(ORDER_ALLOCATION_STATUSES);
export type OrderAllocationStatus = z.infer<typeof OrderAllocationStatusSchema>;

export const FULFILLMENT_STATUSES = [
  'DRAFT',
  'RELEASED',
  'PICKING',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export const FulfillmentStatusSchema = z.enum(FULFILLMENT_STATUSES);
export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>;

export const CUSTOMER_INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
  'DISPUTED',
] as const;
export const CustomerInvoiceStatusSchema = z.enum(CUSTOMER_INVOICE_STATUSES);
export type CustomerInvoiceStatus = z.infer<typeof CustomerInvoiceStatusSchema>;

export const CREDIT_MEMO_STATUSES = [
  'DRAFT',
  'ISSUED',
  'APPLIED',
  'REFUNDED',
  'CANCELLED',
] as const;
export const CreditMemoStatusSchema = z.enum(CREDIT_MEMO_STATUSES);
export type CreditMemoStatus = z.infer<typeof CreditMemoStatusSchema>;

export const RETURN_STATUSES = [
  'REQUESTED',
  'AUTHORIZED',
  'RECEIVED',
  'INSPECTED',
  'PROCESSED',
  'REJECTED',
  'CANCELLED',
] as const;
export const ReturnStatusSchema = z.enum(RETURN_STATUSES);
export type ReturnStatus = z.infer<typeof ReturnStatusSchema>;

export const RETURN_DISPOSITIONS = [
  'RETURN_TO_STOCK',
  'SCRAP',
  'REPAIR',
  'RETURN_TO_VENDOR',
] as const;
export const ReturnDispositionSchema = z.enum(RETURN_DISPOSITIONS);
export type ReturnDisposition = z.infer<typeof ReturnDispositionSchema>;

// ─── Reusable Field Schemas ───────────────────────────────────────────────────

export const OrderDocumentNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(64);

// ─── Entity Schemas ───────────────────────────────────────────────────────────

export const SalesQuoteLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    quoteId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    quotedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    discountPercentBasisPoints: z.number().int().min(0).max(10000).default(0),
    lineSubtotalMinor: MoneyMinorSchema,
    taxRateBasisPoints: z.number().int().nonnegative().default(0),
    lineTaxMinor: MoneyMinorSchema.default('0'),
    lineTotalMinor: MoneyMinorSchema,
    leadTimeDays: z.number().int().nonnegative().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type SalesQuoteLineV1 = z.infer<typeof SalesQuoteLineV1Schema>;

export const SalesQuoteV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    quoteNumber: OrderDocumentNumberSchema,
    orgUnitId: z.string().min(1).max(64),
    customerPartyId: z.string().uuid(),
    customerName: z.string().min(1).max(200),
    currencyCode: CurrencyCodeSchema,
    subtotalMinor: MoneyMinorSchema,
    discountTotalMinor: MoneyMinorSchema.default('0'),
    taxTotalMinor: MoneyMinorSchema.default('0'),
    totalAmountMinor: MoneyMinorSchema,
    status: QuoteStatusSchema,
    validUntil: z.string().datetime(),
    paymentTermDays: z.number().int().nonnegative().default(30),
    notes: z.string().max(2000).optional().nullable(),
    convertedOrderId: z.string().uuid().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(SalesQuoteLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().max(64).optional(),
    updatedBy: z.string().max(64).optional(),
  })
  .strict();
export type SalesQuoteV1 = z.infer<typeof SalesQuoteV1Schema>;

export const SalesOrderLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    orderId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    orderedQuantity: DecimalQuantitySchema,
    allocatedQuantity: DecimalQuantitySchema.default('0'),
    shippedQuantity: DecimalQuantitySchema.default('0'),
    invoicedQuantity: DecimalQuantitySchema.default('0'),
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    discountMinor: MoneyMinorSchema.default('0'),
    taxRateBasisPoints: z.number().int().nonnegative().default(0),
    lineSubtotalMinor: MoneyMinorSchema,
    lineTaxMinor: MoneyMinorSchema.default('0'),
    lineTotalMinor: MoneyMinorSchema,
    warehouseId: z.string().uuid(),
    promisedDate: z.string().datetime().optional().nullable(),
    status: OrderLineStatusSchema,
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type SalesOrderLineV1 = z.infer<typeof SalesOrderLineV1Schema>;

export const SalesOrderV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    orderNumber: OrderDocumentNumberSchema,
    orgUnitId: z.string().min(1).max(64),
    customerPartyId: z.string().uuid(),
    customerName: z.string().min(1).max(200),
    orderType: OrderTypeSchema,
    currencyCode: CurrencyCodeSchema,
    subtotalMinor: MoneyMinorSchema,
    discountTotalMinor: MoneyMinorSchema.default('0'),
    taxTotalMinor: MoneyMinorSchema.default('0'),
    totalAmountMinor: MoneyMinorSchema,
    warehouseId: z.string().uuid(),
    status: OrderStatusSchema,
    quoteId: z.string().uuid().optional().nullable(),
    customerPoReference: z.string().max(100).optional().nullable(),
    paymentTermDays: z.number().int().nonnegative().default(30),
    shippingAddress: z.string().max(500).optional().nullable(),
    confirmedBy: z.string().max(64).optional().nullable(),
    confirmedAt: z.string().datetime().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(SalesOrderLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().max(64).optional(),
    updatedBy: z.string().max(64).optional(),
  })
  .strict();
export type SalesOrderV1 = z.infer<typeof SalesOrderV1Schema>;

export const OrderInventoryAllocationV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    orderId: z.string().uuid(),
    orderLineId: z.string().uuid(),
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional().nullable(),
    allocatedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    status: OrderAllocationStatusSchema,
    allocatedAt: z.string().datetime(),
    allocatedBy: z.string().min(1).max(64),
    releasedAt: z.string().datetime().optional().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type OrderInventoryAllocationV1 = z.infer<typeof OrderInventoryAllocationV1Schema>;

export const FulfillmentOrderLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    fulfillmentOrderId: z.string().uuid(),
    orderLineId: z.string().uuid(),
    productId: z.string().uuid(),
    shippedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    lotNumber: z.string().max(100).optional().nullable(),
    serialNumber: z.string().max(100).optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    createdAt: z.string().datetime(),
  })
  .strict();
export type FulfillmentOrderLineV1 = z.infer<typeof FulfillmentOrderLineV1Schema>;

export const FulfillmentOrderV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    fulfillmentNumber: OrderDocumentNumberSchema,
    orderId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    carrier: z.string().max(100).optional().nullable(),
    trackingNumber: z.string().max(100).optional().nullable(),
    status: FulfillmentStatusSchema,
    dispatchedAt: z.string().datetime().optional().nullable(),
    dispatchedBy: z.string().max(64).optional().nullable(),
    deliveredAt: z.string().datetime().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(FulfillmentOrderLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type FulfillmentOrderV1 = z.infer<typeof FulfillmentOrderV1Schema>;

export const CustomerInvoiceLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    invoiceId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    orderLineId: z.string().uuid().optional().nullable(),
    fulfillmentOrderLineId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    invoicedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    discountMinor: MoneyMinorSchema.default('0'),
    taxRateBasisPoints: z.number().int().nonnegative().default(0),
    lineSubtotalMinor: MoneyMinorSchema,
    lineTaxMinor: MoneyMinorSchema.default('0'),
    lineTotalMinor: MoneyMinorSchema,
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    createdAt: z.string().datetime(),
  })
  .strict();
export type CustomerInvoiceLineV1 = z.infer<typeof CustomerInvoiceLineV1Schema>;

export const CustomerInvoiceV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    invoiceNumber: OrderDocumentNumberSchema,
    orderId: z.string().uuid(),
    customerPartyId: z.string().uuid(),
    customerName: z.string().min(1).max(200),
    currencyCode: CurrencyCodeSchema,
    subtotalMinor: MoneyMinorSchema,
    discountTotalMinor: MoneyMinorSchema.default('0'),
    taxTotalMinor: MoneyMinorSchema.default('0'),
    totalAmountMinor: MoneyMinorSchema,
    amountPaidMinor: MoneyMinorSchema.default('0'),
    status: CustomerInvoiceStatusSchema,
    dueDate: z.string().datetime(),
    issuedAt: z.string().datetime(),
    issuedBy: z.string().min(1).max(64),
    notes: z.string().max(1000).optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(CustomerInvoiceLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CustomerInvoiceV1 = z.infer<typeof CustomerInvoiceV1Schema>;

export const CustomerCreditMemoLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    creditMemoId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    productId: z.string().uuid().optional().nullable(),
    quantity: DecimalQuantitySchema,
    unitPriceMinor: MoneyMinorSchema,
    lineTotalMinor: MoneyMinorSchema,
    reason: z.string().min(1).max(500),
    createdAt: z.string().datetime(),
  })
  .strict();
export type CustomerCreditMemoLineV1 = z.infer<typeof CustomerCreditMemoLineV1Schema>;

export const CustomerCreditMemoV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    creditMemoNumber: OrderDocumentNumberSchema,
    invoiceId: z.string().uuid().optional().nullable(),
    orderId: z.string().uuid().optional().nullable(),
    customerPartyId: z.string().uuid(),
    currencyCode: CurrencyCodeSchema,
    totalAmountMinor: MoneyMinorSchema,
    status: CreditMemoStatusSchema,
    reason: z.string().min(1).max(500),
    issuedAt: z.string().datetime(),
    issuedBy: z.string().min(1).max(64),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(CustomerCreditMemoLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CustomerCreditMemoV1 = z.infer<typeof CustomerCreditMemoV1Schema>;

// ─── Input DTO Schemas ────────────────────────────────────────────────────────

export const CreateSalesQuoteLineInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    quotedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    discountPercentBasisPoints: z.number().int().min(0).max(10000).optional().default(0),
    taxRateBasisPoints: z.number().int().nonnegative().optional().default(0),
    leadTimeDays: z.number().int().nonnegative().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateSalesQuoteLineInputV1 = z.infer<typeof CreateSalesQuoteLineInputV1Schema>;

export const CreateSalesQuoteInputV1Schema = z
  .object({
    orgUnitId: z.string().min(1).max(64),
    customerPartyId: z.string().uuid(),
    customerName: z.string().min(1).max(200),
    currencyCode: CurrencyCodeSchema.default('USD'),
    validUntil: z.string().datetime(),
    paymentTermDays: z.number().int().nonnegative().default(30),
    notes: z.string().max(2000).optional().nullable(),
    lines: z.array(CreateSalesQuoteLineInputV1Schema).min(1),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateSalesQuoteInputV1 = z.infer<typeof CreateSalesQuoteInputV1Schema>;

export const CreateSalesOrderLineInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    orderedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    discountMinor: MoneyMinorSchema.optional().default('0'),
    taxRateBasisPoints: z.number().int().nonnegative().optional().default(0),
    warehouseId: z.string().uuid(),
    promisedDate: z.string().datetime().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateSalesOrderLineInputV1 = z.infer<typeof CreateSalesOrderLineInputV1Schema>;

export const CreateSalesOrderInputV1Schema = z
  .object({
    orgUnitId: z.string().min(1).max(64),
    customerPartyId: z.string().uuid(),
    customerName: z.string().min(1).max(200),
    orderType: OrderTypeSchema.default('STANDARD'),
    currencyCode: CurrencyCodeSchema.default('USD'),
    warehouseId: z.string().uuid(),
    quoteId: z.string().uuid().optional().nullable(),
    customerPoReference: z.string().max(100).optional().nullable(),
    paymentTermDays: z.number().int().nonnegative().default(30),
    shippingAddress: z.string().max(500).optional().nullable(),
    lines: z.array(CreateSalesOrderLineInputV1Schema).min(1),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateSalesOrderInputV1 = z.infer<typeof CreateSalesOrderInputV1Schema>;

export const AllocateOrderLineInputV1Schema = z
  .object({
    orderId: z.string().uuid(),
    orderLineId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional().nullable(),
    allocatedQuantity: DecimalQuantitySchema,
  })
  .strict();
export type AllocateOrderLineInputV1 = z.infer<typeof AllocateOrderLineInputV1Schema>;

export const CreateFulfillmentLineInputV1Schema = z
  .object({
    orderLineId: z.string().uuid(),
    shippedQuantity: DecimalQuantitySchema,
    lotNumber: z.string().max(100).optional().nullable(),
    serialNumber: z.string().max(100).optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateFulfillmentLineInputV1 = z.infer<typeof CreateFulfillmentLineInputV1Schema>;

export const CreateFulfillmentOrderInputV1Schema = z
  .object({
    orderId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    carrier: z.string().max(100).optional().nullable(),
    trackingNumber: z.string().max(100).optional().nullable(),
    lines: z.array(CreateFulfillmentLineInputV1Schema).min(1),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateFulfillmentOrderInputV1 = z.infer<typeof CreateFulfillmentOrderInputV1Schema>;

export const CreateCustomerInvoiceInputV1Schema = z
  .object({
    orderId: z.string().uuid(),
    dueDate: z.string().datetime(),
    notes: z.string().max(1000).optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateCustomerInvoiceInputV1 = z.infer<typeof CreateCustomerInvoiceInputV1Schema>;

export const CreateCustomerCreditMemoInputV1Schema = z
  .object({
    customerPartyId: z.string().uuid(),
    invoiceId: z.string().uuid().optional().nullable(),
    orderId: z.string().uuid().optional().nullable(),
    currencyCode: CurrencyCodeSchema.default('USD'),
    reason: z.string().min(1).max(500),
    lines: z
      .array(
        z
          .object({
            productId: z.string().uuid().optional().nullable(),
            quantity: DecimalQuantitySchema,
            unitPriceMinor: MoneyMinorSchema,
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type CreateCustomerCreditMemoInputV1 = z.infer<typeof CreateCustomerCreditMemoInputV1Schema>;

// ─── Outbox Events ────────────────────────────────────────────────────────────

export const BaseOrderEventSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    occurredAt: z.string().datetime(),
    actorId: z.string().min(1).max(64),
  })
  .strict();

export const SalesOrderCreatedEventV1Schema = BaseOrderEventSchema.extend({
  type: z.literal('sales-order.created.v1'),
  data: z
    .object({
      orderId: z.string().uuid(),
      orderNumber: z.string(),
      customerPartyId: z.string().uuid(),
      totalAmountMinor: MoneyMinorSchema,
      currencyCode: CurrencyCodeSchema,
    })
    .strict(),
}).strict();

export const SalesOrderConfirmedEventV1Schema = BaseOrderEventSchema.extend({
  type: z.literal('sales-order.confirmed.v1'),
  data: z
    .object({
      orderId: z.string().uuid(),
      orderNumber: z.string(),
      confirmedBy: z.string(),
      totalAmountMinor: MoneyMinorSchema,
    })
    .strict(),
}).strict();

export const SalesOrderFulfilledEventV1Schema = BaseOrderEventSchema.extend({
  type: z.literal('sales-order.fulfilled.v1'),
  data: z
    .object({
      orderId: z.string().uuid(),
      fulfillmentId: z.string().uuid(),
      shippedLinesCount: z.number().int().nonnegative(),
    })
    .strict(),
}).strict();

export const CustomerInvoiceIssuedEventV1Schema = BaseOrderEventSchema.extend({
  type: z.literal('customer-invoice.issued.v1'),
  data: z
    .object({
      invoiceId: z.string().uuid(),
      invoiceNumber: z.string(),
      orderId: z.string().uuid(),
      customerPartyId: z.string().uuid(),
      totalAmountMinor: MoneyMinorSchema,
      dueDate: z.string().datetime(),
    })
    .strict(),
}).strict();

export const OrderEventV1Schema = z.discriminatedUnion('type', [
  SalesOrderCreatedEventV1Schema,
  SalesOrderConfirmedEventV1Schema,
  SalesOrderFulfilledEventV1Schema,
  CustomerInvoiceIssuedEventV1Schema,
]);
export type OrderEventV1 = z.infer<typeof OrderEventV1Schema>;
