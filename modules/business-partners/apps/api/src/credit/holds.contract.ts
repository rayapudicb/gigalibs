import { z } from 'zod';

export const CreateManualHoldV1 = z.object({
  requestKey: z.uuid(),
  orgUnitId: z.string().trim().min(1).max(64),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  reason: z.string().trim().min(1).max(1024),
}).strict();

export const ReleaseHoldV1 = z.object({
  requestKey: z.uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1024),
}).strict();

export type CreateManualHold = z.infer<typeof CreateManualHoldV1>;
export type ReleaseHold = z.infer<typeof ReleaseHoldV1>;

export interface CreditHoldV1 {
  readonly id: string;
  readonly partyId: string;
  readonly orgUnitId: string;
  readonly currencyCode: string;
  readonly status: 'ACTIVE' | 'RELEASED';
  readonly origin: 'MANUAL' | 'EXPOSURE';
  readonly reason: string;
  readonly exposureMinor: string | null;
  readonly creditLimitMinor: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly releasedBy: string | null;
  readonly releasedAt: string | null;
  readonly releaseReason: string | null;
}
