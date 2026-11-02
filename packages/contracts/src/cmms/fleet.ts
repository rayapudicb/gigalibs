import { z } from 'zod';

// ─── WI-OI-139 M-DVIR: fleet and heavy-equipment pre-trip inspection (CMMS) ─────────────────────────────
// A check template (revision per code) holds zones of items; an enrolled asset is inspected against the published
// revision, every item answered once. A critical defect grounds the asset (red tag) until a mechanic certifies the
// repair and a different supervisor clears it.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const KeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'Start with a letter; use lowercase letters, digits and dashes.');
const CodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, dot, underscore, slash or dash.'));
const RasterSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const FLEET_PHOTO_MAX_BYTES = 300 * 1024;
/** Photos on one inspection, together, so the request stays inside the 1 MiB request cap. */
export const FLEET_INSPECTION_PHOTOS_MAX_BYTES = 600 * 1024;
const base64Bytes = (value: string) => Math.floor((value.length * 3) / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);

export const FleetCheckItemV1Schema = z
  .object({ key: KeySchema, label: TextSchema(120), hint: TextSchema(300).optional() })
  .strict();
export const FleetCheckZoneV1Schema = z
  .object({ key: KeySchema, title: TextSchema(80), items: z.array(FleetCheckItemV1Schema).min(1).max(30) })
  .strict();
export type FleetCheckZoneV1 = z.infer<typeof FleetCheckZoneV1Schema>;

export const FleetZonesV1Schema = z
  .array(FleetCheckZoneV1Schema)
  .min(1)
  .max(12)
  .superRefine((zones, context) => {
    if (new Set(zones.map((zone) => zone.key)).size !== zones.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each zone key appears once.' });
    const items = zones.flatMap((zone) => zone.items.map((item) => item.key));
    if (new Set(items).size !== items.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each item key appears once in the template.' });
    if (items.length > 120) context.addIssue({ code: z.ZodIssueCode.custom, message: 'A template has at most 120 items.' });
  });

/** Every item key of a template, in zone order. */
export function fleetItemKeys(zones: readonly FleetCheckZoneV1[]): string[] {
  return zones.flatMap((zone) => zone.items.map((item) => item.key));
}

export const CreateFleetTemplateV1Schema = z
  .object({ code: CodeSchema, name: TextSchema(200), classificationId: UuidSchema.optional(), zones: FleetZonesV1Schema })
  .strict();
export const UpdateFleetTemplateV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), name: TextSchema(200).optional(), zones: FleetZonesV1Schema.optional() })
  .strict();
export const FleetVersionV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export const FleetTemplateV1Schema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    name: z.string(),
    revision: z.number().int().positive(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'RETIRED']),
    classificationId: UuidSchema.nullable(),
    zones: z.array(FleetCheckZoneV1Schema),
    authoredBy: PrincipalRefSchema,
    publishedBy: PrincipalRefSchema.nullable(),
    publishedAt: DateTimeSchema.nullable(),
    version: z.number().int().positive(),
    updatedAt: DateTimeSchema,
  })
  .strict();
export type FleetTemplateV1 = z.infer<typeof FleetTemplateV1Schema>;

export const EnrollFleetAssetV1Schema = z
  .object({
    assetId: UuidSchema,
    templateCode: CodeSchema,
    intervalHours: z.number().int().min(1).max(168).default(24),
    requiredCredential: TextSchema(64).optional(),
  })
  .strict();

export const FleetEnrollmentV1Schema = z
  .object({
    assetId: UuidSchema,
    templateCode: z.string(),
    intervalHours: z.number().int(),
    requiredCredential: z.string().nullable(),
    enrolledBy: PrincipalRefSchema,
    version: z.number().int().positive(),
    updatedAt: DateTimeSchema,
  })
  .strict();
export type FleetEnrollmentV1 = z.infer<typeof FleetEnrollmentV1Schema>;

export const FleetOutcomeV1Schema = z.enum(['PASS', 'MINOR', 'CRITICAL', 'NA']);
export type FleetOutcomeV1 = z.infer<typeof FleetOutcomeV1Schema>;

export const SubmitFleetInspectionV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    assetId: UuidSchema,
    templateId: UuidSchema,
    kind: z.enum(['PRE_TRIP', 'POST_TRIP']),
    meterReading: z.number().finite().min(0).optional(),
    startedAt: DateTimeSchema,
    submittedAt: DateTimeSchema,
    /** The inspector's statement that they inspected the equipment themselves. */
    certified: z.literal(true),
    results: z
      .array(
        z
          .object({
            itemKey: KeySchema,
            outcome: FleetOutcomeV1Schema,
            note: TextSchema(1000).optional(),
            photoContentType: RasterSchema.optional(),
            photoBase64: z
              .string()
              .min(16)
              .max(Math.ceil((FLEET_PHOTO_MAX_BYTES * 4) / 3) + 4)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/)
              .optional(),
          })
          .strict()
          .refine((item) => (item.outcome === 'MINOR' || item.outcome === 'CRITICAL') === (item.note !== undefined), {
            message: 'A defect carries a note; a pass or not-applicable item does not.',
          })
          .refine((item) => (item.photoBase64 === undefined) === (item.photoContentType === undefined), {
            message: 'A photo carries its type.',
          })
          .refine((item) => item.photoBase64 === undefined || item.outcome === 'MINOR' || item.outcome === 'CRITICAL', {
            message: 'Photos document defects.',
          }),
      )
      .min(1)
      .max(120),
  })
  .strict()
  .refine((input) => new Set(input.results.map((item) => item.itemKey)).size === input.results.length, {
    message: 'Each item is answered once.',
  })
  .refine((input) => input.results.reduce((sum, item) => sum + (item.photoBase64 ? base64Bytes(item.photoBase64) : 0), 0) <= FLEET_INSPECTION_PHOTOS_MAX_BYTES, {
    message: 'The photos on one inspection are at most 600 KB together.',
  })
  .refine((input) => Date.parse(input.startedAt) <= Date.parse(input.submittedAt), { message: 'An inspection ends after it starts.' });
export type SubmitFleetInspectionV1 = z.infer<typeof SubmitFleetInspectionV1Schema>;

export const FleetInspectionV1Schema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema,
    assetTag: z.string(),
    templateId: UuidSchema,
    templateCode: z.string(),
    revision: z.number().int().positive(),
    kind: z.enum(['PRE_TRIP', 'POST_TRIP']),
    inspectedBy: PrincipalRefSchema,
    startedAt: DateTimeSchema,
    submittedAt: DateTimeSchema,
    meterReading: z.number().nullable(),
    result: z.enum(['PASS', 'DEFECTS', 'GROUNDED']),
    minorCount: z.number().int().min(0),
    criticalCount: z.number().int().min(0),
    requestId: UuidSchema.nullable(),
    groundingId: UuidSchema.nullable(),
    results: z.array(
      z
        .object({ itemKey: z.string(), zoneKey: z.string(), outcome: FleetOutcomeV1Schema, note: z.string().nullable(), hasPhoto: z.boolean() })
        .strict(),
    ),
  })
  .strict();
export type FleetInspectionV1 = z.infer<typeof FleetInspectionV1Schema>;

export const GroundFleetAssetV1Schema = z
  .object({ clientOperationId: UuidSchema, assetId: UuidSchema, reason: TextSchema(1000) })
  .strict();
export const CertifyFleetRepairV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), correctiveAction: TextSchema(2000) })
  .strict();
export const ClearFleetGroundingV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), note: TextSchema(2000).optional(), override: z.boolean().default(false) })
  .strict()
  .refine((input) => !input.override || input.note !== undefined, { message: 'An override says why.' });

export const FleetGroundingV1Schema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema,
    assetTag: z.string(),
    assetName: z.string(),
    source: z.enum(['INSPECTION', 'MANUAL']),
    inspectionId: UuidSchema.nullable(),
    reason: z.string(),
    status: z.enum(['GROUNDED', 'REPAIRED', 'CLEARED']),
    groundedBy: PrincipalRefSchema,
    groundedAt: DateTimeSchema,
    workOrderId: UuidSchema.nullable(),
    correctiveAction: z.string().nullable(),
    certifiedBy: PrincipalRefSchema.nullable(),
    certifiedAt: DateTimeSchema.nullable(),
    clearedBy: PrincipalRefSchema.nullable(),
    clearedAt: DateTimeSchema.nullable(),
    clearanceNote: z.string().nullable(),
    override: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
export type FleetGroundingV1 = z.infer<typeof FleetGroundingV1Schema>;

export const FleetReadinessStateV1Schema = z.enum(['OPERATIONAL', 'INSPECTION_DUE', 'AWAITING_CLEARANCE', 'GROUNDED']);
export type FleetReadinessStateV1 = z.infer<typeof FleetReadinessStateV1Schema>;

export const FleetReadinessV1Schema = z
  .object({
    assetId: UuidSchema,
    assetTag: z.string(),
    assetName: z.string(),
    siteRef: UuidSchema.nullable(),
    departmentId: z.string().nullable(),
    templateCode: z.string(),
    intervalHours: z.number().int(),
    requiredCredential: z.string().nullable(),
    state: FleetReadinessStateV1Schema,
    lastInspectionAt: DateTimeSchema.nullable(),
    lastResult: z.enum(['PASS', 'DEFECTS', 'GROUNDED']).nullable(),
    dueAt: DateTimeSchema.nullable(),
    openGroundingId: UuidSchema.nullable(),
  })
  .strict();
export type FleetReadinessV1 = z.infer<typeof FleetReadinessV1Schema>;

export const FleetEligibilityV1Schema = z
  .object({
    eligible: z.boolean(),
    state: FleetReadinessStateV1Schema,
    /** Workforce has no credential store yet: a required credential is reported, not verified. */
    credentialCheck: z.enum(['NOT_REQUIRED', 'UNVERIFIED']),
  })
  .strict();

export const FleetAssetViewV1Schema = z
  .object({
    readiness: FleetReadinessV1Schema,
    eligibility: FleetEligibilityV1Schema,
    template: FleetTemplateV1Schema.nullable(),
    openGrounding: FleetGroundingV1Schema.nullable(),
    recentInspections: z.array(FleetInspectionV1Schema).max(10),
  })
  .strict();
export type FleetAssetViewV1 = z.infer<typeof FleetAssetViewV1Schema>;

export const SubmitFleetInspectionResultV1Schema = z
  .object({ replayed: z.boolean(), inspection: FleetInspectionV1Schema, readiness: FleetReadinessV1Schema })
  .strict();
export type SubmitFleetInspectionResultV1 = z.infer<typeof SubmitFleetInspectionResultV1Schema>;

/** Readiness from the open grounding and the latest inspection after the last clearance. */
export function fleetReadinessState(input: {
  readonly openGroundingStatus: 'GROUNDED' | 'REPAIRED' | null;
  readonly dueAt: Date | null;
  readonly now: Date;
}): FleetReadinessStateV1 {
  if (input.openGroundingStatus === 'GROUNDED') return 'GROUNDED';
  if (input.openGroundingStatus === 'REPAIRED') return 'AWAITING_CLEARANCE';
  if (!input.dueAt || input.dueAt.getTime() <= input.now.getTime()) return 'INSPECTION_DUE';
  return 'OPERATIONAL';
}
