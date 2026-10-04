import { z } from 'zod';

// ─── Module handshake envelopes (WI-OI-068, ADR-0007) ────────────────────────────────────────────────────
// The Delta 5 envelope a producer's outbox relay delivers to a consumer inbox, and the CMMS ↔ Workforce
// payloads. Logical ids only; each side keeps its own records.

export const RelayEnvelopeV1Schema = z
  .object({
    messageId: z.string().min(1).max(128),
    tenantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    eventType: z.string().min(1).max(128),
    aggregateType: z.string().min(1).max(128),
    aggregateId: z.string().min(1).max(128),
    aggregateVersion: z.number().int().positive(),
    correlationId: z.string().min(1).max(128),
    causationId: z.string().max(128).nullable(),
    schemaVersion: z.number().int().positive(),
    payload: z.record(z.string(), z.unknown()),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type RelayEnvelopeV1 = z.infer<typeof RelayEnvelopeV1Schema>;

const CapabilityCodeSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/** CMMS asks Workforce to staff a work order (event `CMMS_STAFFING_REQUESTED_V1`). */
export const CmmsStaffingRequestedV1Schema = z.object({
  staffingId: z.string().uuid(),
  workOrderId: z.string().uuid(),
  woNumber: z.string().min(1).max(32),
  title: z.string().min(1).max(240),
  siteRef: z.string().uuid().nullable(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  headcount: z.number().int().min(1).max(50),
  capabilityCodes: z.array(CapabilityCodeSchema).max(20),
  requestKey: z.string().uuid(),
});
export type CmmsStaffingRequestedV1 = z.infer<typeof CmmsStaffingRequestedV1Schema>;

/** CMMS withdraws a staffing request (event `CMMS_STAFFING_CANCELLED_V1`). */
export const CmmsStaffingCancelledV1Schema = z.object({
  staffingId: z.string().uuid(),
  workOrderId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
export type CmmsStaffingCancelledV1 = z.infer<typeof CmmsStaffingCancelledV1Schema>;

/** Workforce facts CMMS projects, all carrying `sourceType: 'CMMS_WORK_ORDER'` and `sourceRef: <work order id>`. */
export const WorkforceHandshakeFactV1Schema = z.object({
  sourceType: z.literal('CMMS_WORK_ORDER'),
  sourceRef: z.string().uuid(),
  /** The CMMS staffing request key, on requirement and refusal facts. */
  requestKey: z.string().uuid().nullable().optional(),
  requirementId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  resourceName: z.string().max(200).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  code: z.string().max(128).optional(),
  reason: z.string().max(1000).nullable().optional(),
});
export type WorkforceHandshakeFactV1 = z.infer<typeof WorkforceHandshakeFactV1Schema>;

/** Staffing requested by CMMS for a work order. */
export const RequestCmmsStaffingV1Schema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    headcount: z.number().int().min(1).max(50).default(1),
    capabilityCodes: z.array(CapabilityCodeSchema).max(20).default([]),
  })
  .strict()
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), { message: 'The end must be after the start.', path: ['endsAt'] })
  .refine((value) => Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 31 * 86_400_000, { message: 'Staffing spans at most 31 days.', path: ['endsAt'] });
export type RequestCmmsStaffingV1 = z.infer<typeof RequestCmmsStaffingV1Schema>;

export const CancelCmmsStaffingV1Schema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

/** The latest staffing request of a work order (CMMS projection). */
export interface CmmsStaffingV1 {
  readonly id: string;
  readonly status: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  readonly requirementRef: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly headcount: number;
  readonly capabilityCodes: readonly string[];
  readonly rejectionReason: string | null;
  readonly updatedAt: string;
}

/** A Workforce booking against a work order (CMMS projection; no worker master data). */
export interface CmmsWorkOrderBookingV1 {
  readonly bookingRef: string;
  readonly resourceRef: string;
  readonly resourceName: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'ON_SITE' | 'COMPLETED' | 'CANCELLED';
  readonly updatedAt: string;
}

export * from './commercial-operational.js';
