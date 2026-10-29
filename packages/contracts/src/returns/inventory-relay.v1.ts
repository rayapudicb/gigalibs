import { z } from 'zod';
import { DecimalQuantitySchema, MoneyMinorSchema } from '../catalogue/index.js';
import { RmaDispositionCodeSchema } from './rma.js';

export const RMA_RETURN_RECEIPT_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-rma-return-receipt-command' as const;

export const RMA_SCRAP_GL_REQUESTED_V1 = 'returns.rma.scrap_gl_requested.v1' as const;

export const ORDERS_RETURNS_RMA_INBOX_AUDIENCE = 'gigalibs-orders-returns-rma-inbox' as const;
export const FINANCE_RETURNS_INBOX_AUDIENCE = 'gigalibs-finance-returns-inbox' as const;

export const RmaCreditMemoRequestedLineV1Schema = z
  .object({
    rmaLineId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: DecimalQuantitySchema,
    unitPriceMinor: MoneyMinorSchema,
    reason: z.string().min(1).max(500),
  })
  .strict();

export const RmaCreditMemoRequestedPayloadV1Schema = z
  .object({
    rmaId: z.string().uuid(),
    requestKey: z.string().uuid(),
    customerPartyId: z.string().uuid(),
    salesOrderId: z.string().uuid().nullable(),
    customerInvoiceId: z.string().uuid().nullable(),
    currencyCode: z.string().length(3),
    lines: z.array(RmaCreditMemoRequestedLineV1Schema).min(1),
  })
  .strict();
export type RmaCreditMemoRequestedPayloadV1 = z.infer<typeof RmaCreditMemoRequestedPayloadV1Schema>;

export const RmaReturnReceiptCommandV1Schema = z
  .object({
    commandKey: z.string().uuid(),
    dispositionId: z.string().uuid(),
    rmaId: z.string().uuid(),
    rmaLineId: z.string().uuid(),
    dispositionCode: RmaDispositionCodeSchema,
    warehouseId: z.string().uuid(),
    orgUnitId: z.string().min(1).max(64),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    quantity: DecimalQuantitySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dispositionCode === 'SCRAP') {
      ctx.addIssue({ code: 'custom', message: 'SCRAP dispositions do not use the inventory return receipt command.' });
    }
  });
export type RmaReturnReceiptCommandV1 = z.infer<typeof RmaReturnReceiptCommandV1Schema>;

export const RmaScrapGlRequestedPayloadV1Schema = z
  .object({
    dispositionId: z.string().uuid(),
    rmaId: z.string().uuid(),
    rmaLineId: z.string().uuid(),
    productId: z.string().uuid(),
    uomId: z.string().uuid(),
    quantity: DecimalQuantitySchema,
    customerPartyId: z.string().uuid(),
    salesOrderId: z.string().uuid().nullable(),
    customerInvoiceId: z.string().uuid().nullable(),
  })
  .strict();
export type RmaScrapGlRequestedPayloadV1 = z.infer<typeof RmaScrapGlRequestedPayloadV1Schema>;
