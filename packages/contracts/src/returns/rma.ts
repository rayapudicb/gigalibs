import { z } from 'zod';
import { DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';
import { ExactDecimal } from '../handshake/commercial-operational.js';

export const RMA_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'AUTHORIZED',
  'RECEIVING',
  'INSPECTING',
  'DISPOSED',
  'CLOSED',
  'CANCELLED',
] as const;
export const RmaStatusSchema = z.enum(RMA_STATUSES);
export type RmaStatus = z.infer<typeof RmaStatusSchema>;

export const RMA_DISPOSITION_CODES = ['RESTOCK', 'QUARANTINE', 'SCRAP'] as const;
export const RmaDispositionCodeSchema = z.enum(RMA_DISPOSITION_CODES);
export type RmaDispositionCode = z.infer<typeof RmaDispositionCodeSchema>;

export const RmaLineV1Schema = z
  .object({
    id: z.string().uuid(),
    lineNumber: z.number().int().positive(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    requestedQuantity: DecimalQuantitySchema,
    authorizedQuantity: DecimalQuantitySchema,
    receivedQuantity: DecimalQuantitySchema,
    invoicedQuantityCap: DecimalQuantitySchema,
    salesOrderLineId: z.string().uuid().nullable(),
    customerInvoiceLineId: z.string().uuid().nullable(),
  })
  .strict();
export type RmaLineV1 = z.infer<typeof RmaLineV1Schema>;

export const RmaV1Schema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().min(1).max(64),
    rmaNumber: z.string().min(1).max(64),
    status: RmaStatusSchema,
    customerPartyId: z.string().uuid(),
    salesOrderId: z.string().uuid().nullable(),
    customerInvoiceId: z.string().uuid().nullable(),
    ordersReturnId: z.string().uuid().nullable(),
    reason: z.string().min(1).max(2000),
    version: z.number().int().positive(),
    lines: z.array(RmaLineV1Schema),
    createdBy: z.string().min(1).max(128),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type RmaV1 = z.infer<typeof RmaV1Schema>;

export const CreateRmaLineInputV1Schema = z
  .object({
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    requestedQuantity: DecimalQuantitySchema,
    invoicedQuantityCap: DecimalQuantitySchema,
    salesOrderLineId: z.string().uuid().optional().nullable(),
    customerInvoiceLineId: z.string().uuid().optional().nullable(),
  })
  .strict();

export const CreateRmaInputV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    rmaNumber: z.string().min(1).max(64),
    customerPartyId: z.string().uuid(),
    salesOrderId: z.string().uuid().optional().nullable(),
    customerInvoiceId: z.string().uuid().optional().nullable(),
    ordersReturnId: z.string().uuid().optional().nullable(),
    reason: z.string().min(1).max(2000),
    lines: z.array(CreateRmaLineInputV1Schema).min(1),
  })
  .strict();
export type CreateRmaInputV1 = z.infer<typeof CreateRmaInputV1Schema>;

export const RmaDocumentActionInputV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export type RmaDocumentActionInputV1 = z.infer<typeof RmaDocumentActionInputV1Schema>;

export const RecordRmaDispositionInputV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    rmaLineId: z.string().uuid(),
    dispositionCode: RmaDispositionCodeSchema,
    quantity: DecimalQuantitySchema,
    notes: z.string().max(2000).optional().nullable(),
    requestCreditMemo: z.boolean().default(false),
  })
  .strict();
export type RecordRmaDispositionInputV1 = z.infer<typeof RecordRmaDispositionInputV1Schema>;

export const RequestRmaCreditMemoLineV1Schema = z
  .object({
    rmaLineId: z.string().uuid(),
    unitPriceMinor: MoneyMinorSchema,
    reason: z.string().min(1).max(500),
  })
  .strict();

export const RequestRmaCreditMemoInputV1Schema = z
  .object({
    requestKey: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    currencyCode: z.string().length(3).default('USD'),
    lines: z.array(RequestRmaCreditMemoLineV1Schema).min(1),
  })
  .strict();
export type RequestRmaCreditMemoInputV1 = z.infer<typeof RequestRmaCreditMemoInputV1Schema>;

export const RMA_CREDIT_MEMO_REQUESTED_V1 = 'returns.rma.credit_memo_requested.v1' as const;

/** Pure guard: returned quantity cannot exceed invoiced quantity (Module 6 / WI-OI-128). */
export function assertReturnQuantityWithinInvoiced(requested: string, invoicedCap: string): void {
  DecimalQuantitySchema.parse(requested);
  DecimalQuantitySchema.parse(invoicedCap);
  if (ExactDecimal.compare(requested, invoicedCap) > 0) {
    throw new Error('RETURN_QUANTITY_EXCEEDS_INVOICED');
  }
}
