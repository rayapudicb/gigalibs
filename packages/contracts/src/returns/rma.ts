import { z } from 'zod';
import { DecimalQuantitySchema } from '../catalogue/index.js';
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

/** Pure guard: returned quantity cannot exceed invoiced quantity (Module 6 / WI-OI-128). */
export function assertReturnQuantityWithinInvoiced(requested: string, invoicedCap: string): void {
  DecimalQuantitySchema.parse(requested);
  DecimalQuantitySchema.parse(invoicedCap);
  if (ExactDecimal.compare(requested, invoicedCap) > 0) {
    throw new Error('RETURN_QUANTITY_EXCEEDS_INVOICED');
  }
}
