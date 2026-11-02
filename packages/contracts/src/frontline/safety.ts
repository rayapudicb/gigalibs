import { z } from 'zod';

// ─── WI-OI-141 M-INC: frontline hazard, near-miss and incident reports (Safety Operations, ADR-0036) ─────
// A report is captured in seconds (severity, category, photo, area); triage rates it and routes it; a STOP_WORK
// report raises an alert people acknowledge until someone other than the reporter lifts it with a reason.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().min(1).max(128);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const RasterSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const HAZARD_PHOTO_MAX_BYTES = 300 * 1024;
export const HazardSeverityV1Schema = z.enum(['GOOD_CATCH', 'UNSAFE_CONDITION', 'STOP_WORK']);
export type HazardSeverityV1 = z.infer<typeof HazardSeverityV1Schema>;
export const HazardCategoryV1Schema = z.enum([
  'SLIP_TRIP_FALL', 'LEAK_SPILL', 'ELECTRICAL', 'MACHINE_GUARDING', 'PINCH_POINT', 'CHEMICAL', 'FIRE', 'ERGONOMIC',
  'VEHICLE', 'WORKING_AT_HEIGHT', 'OTHER',
]);
export type HazardCategoryV1 = z.infer<typeof HazardCategoryV1Schema>;
export const HazardRouteV1Schema = z.enum(['MAINTENANCE', 'TRAINING', 'INVESTIGATION', 'RESOLVED']);
export type HazardRouteV1 = z.infer<typeof HazardRouteV1Schema>;

/** Hours to triage by severity; a stop-work report is due at once. */
export const HAZARD_TRIAGE_HOURS: Readonly<Record<HazardSeverityV1, number>> = Object.freeze({
  GOOD_CATCH: 48, UNSAFE_CONDITION: 8, STOP_WORK: 0,
});

export const ReportHazardV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    severity: HazardSeverityV1Schema,
    category: HazardCategoryV1Schema,
    description: TextSchema(2000),
    area: TextSchema(200),
    siteRef: UuidSchema.optional(),
    assetRef: UuidSchema.optional(),
    observedAt: DateTimeSchema,
    photoContentType: RasterSchema.optional(),
    photoBase64: z.string().min(16).max(Math.ceil((HAZARD_PHOTO_MAX_BYTES * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
  })
  .strict()
  .refine((input) => (input.photoBase64 === undefined) === (input.photoContentType === undefined), { message: 'A photo carries its type.' });
export type ReportHazardV1 = z.infer<typeof ReportHazardV1Schema>;

/** Likelihood × consequence, each 1–5: the score and its band. */
export function hazardRisk(likelihood: number, consequence: number): { score: number; band: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' } {
  const score = likelihood * consequence;
  return { score, band: score >= 20 ? 'EXTREME' : score >= 12 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW' };
}

export const TriageHazardV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    likelihood: z.number().int().min(1).max(5),
    consequence: z.number().int().min(1).max(5),
    route: HazardRouteV1Schema,
    note: TextSchema(2000).optional(),
  })
  .strict();
export const CloseHazardV1Schema = z.object({ expectedVersion: z.number().int().positive(), resolution: TextSchema(2000) }).strict();
export const LiftStopWorkV1Schema = z.object({ expectedVersion: z.number().int().positive(), reason: TextSchema(1000) }).strict();
export const InvestigationV1InputSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    whys: z.array(TextSchema(500)).min(1).max(5),
    rootCause: TextSchema(1000),
    contributingFactors: z.array(TextSchema(300)).max(10).default([]),
    complete: z.boolean().default(false),
  })
  .strict();

export const StopWorkAlertV1Schema = z
  .object({
    id: UuidSchema,
    reportId: UuidSchema,
    area: z.string(),
    status: z.enum(['OPEN', 'LIFTED']),
    raisedAt: DateTimeSchema,
    acknowledgements: z.number().int().min(0),
    acknowledgedByMe: z.boolean(),
    liftedBy: PrincipalRefSchema.nullable(),
    liftedAt: DateTimeSchema.nullable(),
    liftReason: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type StopWorkAlertV1 = z.infer<typeof StopWorkAlertV1Schema>;

export const HazardInvestigationV1Schema = z
  .object({
    reportId: UuidSchema,
    whys: z.array(z.string()),
    rootCause: z.string(),
    contributingFactors: z.array(z.string()),
    investigator: PrincipalRefSchema,
    completedAt: DateTimeSchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type HazardInvestigationV1 = z.infer<typeof HazardInvestigationV1Schema>;

export const HazardReportV1Schema = z
  .object({
    id: UuidSchema,
    reference: z.string(),
    severity: HazardSeverityV1Schema,
    category: HazardCategoryV1Schema,
    description: z.string(),
    area: z.string(),
    siteRef: UuidSchema.nullable(),
    assetRef: UuidSchema.nullable(),
    reportedBy: PrincipalRefSchema,
    observedAt: DateTimeSchema,
    receivedAt: DateTimeSchema,
    triageDueAt: DateTimeSchema,
    status: z.enum(['REPORTED', 'TRIAGED', 'CLOSED']),
    likelihood: z.number().int().nullable(),
    consequence: z.number().int().nullable(),
    riskScore: z.number().int().nullable(),
    route: HazardRouteV1Schema.nullable(),
    triagedBy: PrincipalRefSchema.nullable(),
    triageNote: z.string().nullable(),
    resolution: z.string().nullable(),
    closedBy: PrincipalRefSchema.nullable(),
    hasPhoto: z.boolean(),
    stopWork: StopWorkAlertV1Schema.nullable(),
    investigation: HazardInvestigationV1Schema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type HazardReportV1 = z.infer<typeof HazardReportV1Schema>;

export const ReportHazardResultV1Schema = z.object({ replayed: z.boolean(), report: HazardReportV1Schema }).strict();
export type ReportHazardResultV1 = z.infer<typeof ReportHazardResultV1Schema>;

export const HazardInsightsV1Schema = z
  .object({
    from: DateTimeSchema,
    to: DateTimeSchema,
    total: z.number().int().min(0),
    overdueTriage: z.number().int().min(0),
    byArea: z.array(z.object({ area: z.string(), count: z.number().int(), stopWork: z.number().int() }).strict()),
    byCategory: z.array(z.object({ category: HazardCategoryV1Schema, count: z.number().int() }).strict()),
  })
  .strict();
export type HazardInsightsV1 = z.infer<typeof HazardInsightsV1Schema>;
