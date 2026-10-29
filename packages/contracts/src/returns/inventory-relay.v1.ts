import { z } from 'zod';
import { DecimalQuantitySchema } from '../catalogue/index.js';
import { RmaDispositionCodeSchema } from './rma.js';

export const RMA_RETURN_RECEIPT_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-rma-return-receipt-command' as const;

export const RMA_SCRAP_GL_REQUESTED_V1 = 'returns.rma.scrap_gl_requested.v1' as const;

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
