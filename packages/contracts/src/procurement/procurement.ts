import { z } from 'zod';
import { CurrencyCodeSchema, DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';

// ─── Enums & Value Sets ────────────────────────────────────────────────────────

export const REQUISITION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CONVERTED',
  'CANCELLED',
] as const;
export const RequisitionStatusSchema = z.enum(REQUISITION_STATUSES);
export type RequisitionStatus = z.infer<typeof RequisitionStatusSchema>;

export const REQUISITION_LINE_STATUSES = ['DRAFT', 'APPROVED', 'ORDERED', 'CANCELLED'] as const;
export const RequisitionLineStatusSchema = z.enum(REQUISITION_LINE_STATUSES);
export type RequisitionLineStatus = z.infer<typeof RequisitionLineStatusSchema>;

export const PURCHASE_ORDER_TYPES = ['STANDARD', 'BLANKET', 'PLANNED', 'CONTRACT'] as const;
export const PurchaseOrderTypeSchema = z.enum(PURCHASE_ORDER_TYPES);
export type PurchaseOrderType = z.infer<typeof PurchaseOrderTypeSchema>;

export const PURCHASE_ORDER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'ISSUED',
  'ACKNOWLEDGED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
] as const;
export const PurchaseOrderStatusSchema = z.enum(PURCHASE_ORDER_STATUSES);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

export const PURCHASE_ORDER_LINE_STATUSES = [
  'OPEN',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED',
] as const;
export const PurchaseOrderLineStatusSchema = z.enum(PURCHASE_ORDER_LINE_STATUSES);
export type PurchaseOrderLineStatus = z.infer<typeof PurchaseOrderLineStatusSchema>;

export const MATCH_STATUSES = [
  'UNMATCHED',
  'PARTIALLY_MATCHED',
  'FULLY_MATCHED',
  'VARIANCE_HOLD',
  'FORCE_MATCHED',
] as const;
export const MatchStatusSchema = z.enum(MATCH_STATUSES);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const VENDOR_BILL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_MATCH',
  'MATCHED',
  'PRICE_VARIANCE_HOLD',
  'APPROVED',
  'PAID',
  'VOID',
] as const;
export const VendorBillStatusSchema = z.enum(VENDOR_BILL_STATUSES);
export type VendorBillStatus = z.infer<typeof VendorBillStatusSchema>;

export const DEBIT_MEMO_STATUSES = ['DRAFT', 'ISSUED', 'APPLIED', 'REFUNDED', 'CANCELLED'] as const;
export const DebitMemoStatusSchema = z.enum(DEBIT_MEMO_STATUSES);
export type DebitMemoStatus = z.infer<typeof DebitMemoStatusSchema>;

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const INCOTERMS = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const;
export const IncotermSchema = z.enum(INCOTERMS);
export type Incoterm = z.infer<typeof IncotermSchema>;

// ─── Reusable Field Schemas ───────────────────────────────────────────────────

export const DocumentNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
// ─── Entity Schemas ───────────────────────────────────────────────────────────

export const ProcurementRequisitionLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    requisitionId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    quantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    estimatedUnitPriceMinor: MoneyMinorSchema,
    estimatedTotalMinor: MoneyMinorSchema,
    requiredDate: z.string().datetime().optional().nullable(),
    costCenterId: z.string().max(64).optional().nullable(),
    projectId: z.string().max(64).optional().nullable(),
    status: RequisitionLineStatusSchema,
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ProcurementRequisitionLineV1 = z.infer<typeof ProcurementRequisitionLineV1Schema>;

export const ProcurementRequisitionV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    requisitionNumber: DocumentNumberSchema,
    orgUnitId: z.string().min(1).max(64),
    requestedBy: z.string().min(1).max(64),
    description: z.string().max(1000).optional().nullable(),
    status: RequisitionStatusSchema,
    totalEstimatedMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
    approvalPolicyId: z.string().uuid().optional().nullable(),
    approvedBy: z.string().max(64).optional().nullable(),
    approvedAt: z.string().datetime().optional().nullable(),
    rejectionReason: z.string().max(500).optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(ProcurementRequisitionLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().max(64).optional(),
    updatedBy: z.string().max(64).optional(),
  })
  .strict();
export type ProcurementRequisitionV1 = z.infer<typeof ProcurementRequisitionV1Schema>;

export const PurchaseOrderLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    purchaseOrderId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    requisitionLineId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    orderedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    taxRateBasisPoints: z.number().int().nonnegative().default(0),
    lineTaxMinor: MoneyMinorSchema.default('0'),
    lineSubtotalMinor: MoneyMinorSchema,
    lineTotalMinor: MoneyMinorSchema,
    receivedQuantity: DecimalQuantitySchema.default('0'),
    invoicedQuantity: DecimalQuantitySchema.default('0'),
    destinationWarehouseId: z.string().uuid(),
    destinationLocationId: z.string().uuid().optional().nullable(),
    promisedDate: z.string().datetime().optional().nullable(),
    status: PurchaseOrderLineStatusSchema,
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type PurchaseOrderLineV1 = z.infer<typeof PurchaseOrderLineV1Schema>;

export const PurchaseOrderV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    orderNumber: DocumentNumberSchema,
    orgUnitId: z.string().min(1).max(64),
    vendorPartyId: z.string().uuid(),
    vendorName: z.string().min(1).max(200),
    orderType: PurchaseOrderTypeSchema.default('STANDARD'),
    status: PurchaseOrderStatusSchema,
    currencyCode: CurrencyCodeSchema,
    subtotalMinor: MoneyMinorSchema,
    taxTotalMinor: MoneyMinorSchema.default('0'),
    totalAmountMinor: MoneyMinorSchema,
    paymentTermDays: z.number().int().nonnegative().default(30),
    incoterm: IncotermSchema.optional().nullable(),
    requisitionId: z.string().uuid().optional().nullable(),
    destinationWarehouseId: z.string().uuid(),
    revisionNumber: z.number().int().nonnegative().default(0),
    issuedAt: z.string().datetime().optional().nullable(),
    issuedBy: z.string().max(64).optional().nullable(),
    acknowledgedAt: z.string().datetime().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(PurchaseOrderLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().max(64).optional(),
    updatedBy: z.string().max(64).optional(),
  })
  .strict();
export type PurchaseOrderV1 = z.infer<typeof PurchaseOrderV1Schema>;

export const MatchPoReceiptRecordV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    purchaseOrderId: z.string().uuid(),
    purchaseOrderLineId: z.string().uuid(),
    receiptId: z.string().uuid(),
    receiptLineId: z.string().uuid(),
    matchedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    matchedBy: z.string().min(1).max(64),
    matchedAt: z.string().datetime(),
    status: MatchStatusSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type MatchPoReceiptRecordV1 = z.infer<typeof MatchPoReceiptRecordV1Schema>;

export const MatchPoInvoiceRecordV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    purchaseOrderId: z.string().uuid(),
    purchaseOrderLineId: z.string().uuid(),
    vendorBillId: z.string().uuid(),
    vendorBillLineId: z.string().uuid(),
    receiptLineId: z.string().uuid().optional().nullable(),
    matchedQuantity: DecimalQuantitySchema,
    poUnitPriceMinor: MoneyMinorSchema,
    billedUnitPriceMinor: MoneyMinorSchema,
    priceVarianceMinor: MoneyMinorSchema,
    priceVariancePercent: z.number(),
    status: MatchStatusSchema,
    toleranceExceeded: z.boolean(),
    overrideAuthorizedBy: z.string().max(64).optional().nullable(),
    overrideReason: z.string().max(500).optional().nullable(),
    matchedBy: z.string().min(1).max(64),
    matchedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type MatchPoInvoiceRecordV1 = z.infer<typeof MatchPoInvoiceRecordV1Schema>;

export const VendorBillLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    vendorBillId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    purchaseOrderLineId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(500),
    billedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    lineSubtotalMinor: MoneyMinorSchema,
    lineTaxMinor: MoneyMinorSchema.default('0'),
    lineTotalMinor: MoneyMinorSchema,
    matchedReceiptLineId: z.string().uuid().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type VendorBillLineV1 = z.infer<typeof VendorBillLineV1Schema>;

export const VendorBillV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    vendorPartyId: z.string().uuid(),
    vendorInvoiceNumber: z.string().min(1).max(100),
    invoiceDate: z.string().datetime(),
    dueDate: z.string().datetime(),
    currencyCode: CurrencyCodeSchema,
    subtotalMinor: MoneyMinorSchema,
    taxTotalMinor: MoneyMinorSchema.default('0'),
    totalAmountMinor: MoneyMinorSchema,
    purchaseOrderId: z.string().uuid().optional().nullable(),
    status: VendorBillStatusSchema,
    approvedBy: z.string().max(64).optional().nullable(),
    approvedAt: z.string().datetime().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional().default({}),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(VendorBillLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: z.string().max(64).optional(),
    updatedBy: z.string().max(64).optional(),
  })
  .strict();
export type VendorBillV1 = z.infer<typeof VendorBillV1Schema>;

export const DebitMemoLineV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    debitMemoId: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    productId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(500),
    quantity: DecimalQuantitySchema,
    unitPriceMinor: MoneyMinorSchema,
    lineTotalMinor: MoneyMinorSchema,
    reason: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
  })
  .strict();
export type DebitMemoLineV1 = z.infer<typeof DebitMemoLineV1Schema>;

export const DebitMemoV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    debitMemoNumber: DocumentNumberSchema,
    vendorPartyId: z.string().uuid(),
    vendorBillId: z.string().uuid().optional().nullable(),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    currencyCode: CurrencyCodeSchema,
    totalAmountMinor: MoneyMinorSchema,
    status: DebitMemoStatusSchema,
    reason: z.string().min(1).max(500),
    issuedAt: z.string().datetime(),
    issuedBy: z.string().min(1).max(64),
    version: z.number().int().nonnegative().default(1),
    lines: z.array(DebitMemoLineV1Schema).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type DebitMemoV1 = z.infer<typeof DebitMemoV1Schema>;

export const ApprovalPolicyV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    policyName: z.string().min(1).max(100),
    orgUnitId: z.string().max(64).optional().nullable(),
    maxAmountMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
    requiredRole: z.string().min(1).max(64),
    sortOrder: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type ApprovalPolicyV1 = z.infer<typeof ApprovalPolicyV1Schema>;

// ─── Input DTO Schemas ────────────────────────────────────────────────────────

export const CreateRequisitionLineInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    quantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    estimatedUnitPriceMinor: MoneyMinorSchema,
    requiredDate: z.string().datetime().optional().nullable(),
    costCenterId: z.string().max(64).optional().nullable(),
    projectId: z.string().max(64).optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateRequisitionLineInputV1 = z.infer<typeof CreateRequisitionLineInputV1Schema>;

export const CreateRequisitionInputV1Schema = z
  .object({
    orgUnitId: z.string().min(1).max(64),
    description: z.string().max(1000).optional().nullable(),
    currencyCode: CurrencyCodeSchema.default('USD'),
    lines: z.array(CreateRequisitionLineInputV1Schema).min(1),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateRequisitionInputV1 = z.infer<typeof CreateRequisitionInputV1Schema>;

export const CreatePurchaseOrderLineInputV1Schema = z
  .object({
    requisitionLineId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid(),
    productCode: z.string().min(1).max(64),
    productName: z.string().min(1).max(200),
    orderedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    taxRateBasisPoints: z.number().int().nonnegative().default(0),
    destinationWarehouseId: z.string().uuid(),
    destinationLocationId: z.string().uuid().optional().nullable(),
    promisedDate: z.string().datetime().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreatePurchaseOrderLineInputV1 = z.infer<typeof CreatePurchaseOrderLineInputV1Schema>;

export const CreatePurchaseOrderInputV1Schema = z
  .object({
    orgUnitId: z.string().min(1).max(64),
    vendorPartyId: z.string().uuid(),
    vendorName: z.string().min(1).max(200),
    currencyCode: CurrencyCodeSchema.default('USD'),
    destinationWarehouseId: z.string().uuid(),
    paymentTermDays: z.number().int().nonnegative().default(30),
    incoterm: IncotermSchema.optional().nullable(),
    requisitionId: z.string().uuid().optional().nullable(),
    lines: z.array(CreatePurchaseOrderLineInputV1Schema).min(1),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreatePurchaseOrderInputV1 = z.infer<typeof CreatePurchaseOrderInputV1Schema>;

/** Converts an APPROVED requisition into a draft purchase order (iDempiere-style req → PO). */
export const ConvertRequisitionToPurchaseOrderInputV1Schema = z
  .object({
    vendorPartyId: z.string().uuid(),
    vendorName: z.string().min(1).max(200),
    destinationWarehouseId: z.string().uuid(),
  })
  .strict();
export type ConvertRequisitionToPurchaseOrderInputV1 = z.infer<
  typeof ConvertRequisitionToPurchaseOrderInputV1Schema
>;

export const MatchReceiptInputV1Schema = z
  .object({
    purchaseOrderId: z.string().uuid(),
    purchaseOrderLineId: z.string().uuid(),
    receiptId: z.string().uuid(),
    receiptLineId: z.string().uuid(),
    matchedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
  })
  .strict();
export type MatchReceiptInputV1 = z.infer<typeof MatchReceiptInputV1Schema>;

export const CreateVendorBillLineInputV1Schema = z
  .object({
    purchaseOrderId: z.string().uuid().optional().nullable(),
    purchaseOrderLineId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(500),
    billedQuantity: DecimalQuantitySchema,
    uomId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    lineTaxMinor: MoneyMinorSchema.default('0'),
    matchedReceiptLineId: z.string().uuid().optional().nullable(),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateVendorBillLineInputV1 = z.infer<typeof CreateVendorBillLineInputV1Schema>;

export const CreateVendorBillInputV1Schema = z
  .object({
    vendorPartyId: z.string().uuid(),
    vendorInvoiceNumber: z.string().min(1).max(100),
    invoiceDate: z.string().datetime(),
    dueDate: z.string().datetime(),
    currencyCode: CurrencyCodeSchema.default('USD'),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    lines: z.array(CreateVendorBillLineInputV1Schema).min(1),
    customExtensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateVendorBillInputV1 = z.infer<typeof CreateVendorBillInputV1Schema>;

export const MatchInvoiceInputV1Schema = z
  .object({
    purchaseOrderId: z.string().uuid(),
    purchaseOrderLineId: z.string().uuid(),
    vendorBillId: z.string().uuid(),
    vendorBillLineId: z.string().uuid(),
    receiptLineId: z.string().uuid().optional().nullable(),
    matchedQuantity: DecimalQuantitySchema,
  })
  .strict();
export type MatchInvoiceInputV1 = z.infer<typeof MatchInvoiceInputV1Schema>;

export const ApprovePriceVarianceInputV1Schema = z
  .object({
    matchRecordId: z.string().uuid(),
    overrideReason: z.string().min(1).max(500),
  })
  .strict();
export type ApprovePriceVarianceInputV1 = z.infer<typeof ApprovePriceVarianceInputV1Schema>;

export const CreateDebitMemoLineInputV1Schema = z
  .object({
    productId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(500),
    quantity: DecimalQuantitySchema,
    unitPriceMinor: MoneyMinorSchema,
    reason: z.string().min(1).max(500),
  })
  .strict();
export type CreateDebitMemoLineInputV1 = z.infer<typeof CreateDebitMemoLineInputV1Schema>;

export const CreateDebitMemoInputV1Schema = z
  .object({
    vendorPartyId: z.string().uuid(),
    vendorBillId: z.string().uuid().optional().nullable(),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    currencyCode: CurrencyCodeSchema.default('USD'),
    reason: z.string().min(1).max(500),
    lines: z.array(CreateDebitMemoLineInputV1Schema).min(1),
  })
  .strict();
export type CreateDebitMemoInputV1 = z.infer<typeof CreateDebitMemoInputV1Schema>;

export const CreateApprovalPolicyInputV1Schema = z
  .object({
    policyName: z.string().min(1).max(100),
    orgUnitId: z.string().max(64).optional().nullable(),
    maxAmountMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema.default('USD'),
    requiredRole: z.string().min(1).max(64),
    sortOrder: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
  })
  .strict();
export type CreateApprovalPolicyInputV1 = z.infer<typeof CreateApprovalPolicyInputV1Schema>;

// ─── Outbox Events ────────────────────────────────────────────────────────────


export const BaseProcurementEventSchema = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string().min(1).max(64),
  occurredAt: z.string().datetime(),
  schemaVersion: z.literal(1),
  actorId: z.string().optional(),
});

export const RequisitionCreatedEventV1Schema = BaseProcurementEventSchema.extend({
  type: z.literal('procurement.requisition.created.v1'),
  data: z.object({
    requisitionId: z.string().uuid(),
    requisitionNumber: DocumentNumberSchema,
    totalEstimatedMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
  }),
}).strict();
export type RequisitionCreatedEventV1 = z.infer<typeof RequisitionCreatedEventV1Schema>;

export const RequisitionApprovedEventV1Schema = BaseProcurementEventSchema.extend({
  type: z.literal('procurement.requisition.approved.v1'),
  data: z.object({
    requisitionId: z.string().uuid(),
    requisitionNumber: DocumentNumberSchema,
    approvedBy: z.string().min(1).max(64),
  }),
}).strict();
export type RequisitionApprovedEventV1 = z.infer<typeof RequisitionApprovedEventV1Schema>;

export const PurchaseOrderIssuedEventV1Schema = BaseProcurementEventSchema.extend({
  type: z.literal('procurement.order.issued.v1'),
  data: z.object({
    purchaseOrderId: z.string().uuid(),
    orderNumber: DocumentNumberSchema,
    vendorPartyId: z.string().uuid(),
    totalAmountMinor: MoneyMinorSchema,
    currencyCode: CurrencyCodeSchema,
  }),
}).strict();
export type PurchaseOrderIssuedEventV1 = z.infer<typeof PurchaseOrderIssuedEventV1Schema>;

export const ReceiptMatchedEventV1Schema = BaseProcurementEventSchema.extend({
  type: z.literal('procurement.match.receipt.created.v1'),
  data: z.object({
    matchRecordId: z.string().uuid(),
    purchaseOrderId: z.string().uuid(),
    purchaseOrderLineId: z.string().uuid(),
    receiptLineId: z.string().uuid(),
    matchedQuantity: DecimalQuantitySchema,
  }),
}).strict();
export type ReceiptMatchedEventV1 = z.infer<typeof ReceiptMatchedEventV1Schema>;

export const InvoiceMatchedEventV1Schema = BaseProcurementEventSchema.extend({
  type: z.literal('procurement.match.invoice.created.v1'),
  data: z.object({
    matchRecordId: z.string().uuid(),
    purchaseOrderId: z.string().uuid(),
    purchaseOrderLineId: z.string().uuid(),
    vendorBillLineId: z.string().uuid(),
    matchedQuantity: DecimalQuantitySchema,
    toleranceExceeded: z.boolean(),
  }),
}).strict();
export type InvoiceMatchedEventV1 = z.infer<typeof InvoiceMatchedEventV1Schema>;

export const ProcurementEventV1Schema = z.discriminatedUnion('type', [
  RequisitionCreatedEventV1Schema,
  RequisitionApprovedEventV1Schema,
  PurchaseOrderIssuedEventV1Schema,
  ReceiptMatchedEventV1Schema,
  InvoiceMatchedEventV1Schema,
]);
export type ProcurementEventV1 = z.infer<typeof ProcurementEventV1Schema>;
