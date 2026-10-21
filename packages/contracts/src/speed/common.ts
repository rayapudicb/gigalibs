import { z } from 'zod';

// WI-OI-120bw/120bx (SPEED): shapes every SPEED contract shares.

export const SpeedNameSchema = z.string().trim().min(1).max(200);
export const SpeedNotesSchema = z.string().max(4000);
/** Every change after creation says why (FR-AUD-01). */
export const SpeedReasonSchema = z.string().trim().min(1).max(500);
/** The row version the caller read; a stale one is refused. */
export const SpeedRowVersionSchema = z.number().int().positive();

export const SpeedPageQueryV1Schema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().min(1).max(200).optional(),
});

export const SPEED_RECORD_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const SpeedRecordStatusSchema = z.enum(SPEED_RECORD_STATUSES);
export type SpeedRecordStatus = z.infer<typeof SpeedRecordStatusSchema>;

export const SpeedArchiveInputV1Schema = z
  .object({ version: SpeedRowVersionSchema, reason: SpeedReasonSchema })
  .strict();
export type SpeedArchiveInputV1 = z.infer<typeof SpeedArchiveInputV1Schema>;

export interface SpeedPageV1<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
