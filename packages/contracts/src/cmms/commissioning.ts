import { z } from 'zod';

// ─── WI-OI-135 M-TAG: asset tagging, field commissioning and floor-walk audits (CMMS extension) ──────────
// A technician proposes a new asset from the floor; a different reviewer creates it in the register (or links the
// physical tag to an existing asset). Physical tags (NFC, DataMatrix, QR, Code 128, RFID) bind to CMMS assets with one
// active binding per tag. A floor walk records tag sightings and reports seen, missing, relocated and unknown tags.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const IdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, dot, underscore, slash or dash.'));

export const AssetTagKindV1Schema = z.enum(['NFC', 'RFID', 'DATAMATRIX', 'QR', 'CODE128']);
export type AssetTagKindV1 = z.infer<typeof AssetTagKindV1Schema>;

/**
 * The stored form of a tag value: trimmed; NFC and RFID identifiers are hexadecimal UIDs compared without separators
 * and in upper case. Printable characters only.
 */
export function normalizeAssetTagValue(kind: AssetTagKindV1, value: string): string {
  const trimmed = value.trim();
  return kind === 'NFC' || kind === 'RFID' ? trimmed.replace(/[\s:-]/g, '').toUpperCase() : trimmed;
}

export const AssetTagRefV1Schema = z
  .object({ kind: AssetTagKindV1Schema, value: z.string().trim().min(1).max(256).regex(/^[\x20-\x7E]+$/, 'Printable characters only.') })
  .strict()
  .transform((tag) => ({ kind: tag.kind, value: normalizeAssetTagValue(tag.kind, tag.value) }))
  .refine((tag) => tag.value.length > 0 && (!['NFC', 'RFID'].includes(tag.kind) || /^[0-9A-F]{4,64}$/.test(tag.value)), {
    message: 'An NFC or RFID identifier is 4–64 hexadecimal characters.',
  });
export type AssetTagRefV1 = z.infer<typeof AssetTagRefV1Schema>;

export const AssetPhysicalTagV1Schema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema,
    kind: AssetTagKindV1Schema,
    value: z.string(),
    status: z.enum(['ACTIVE', 'RETIRED']),
    boundBy: PrincipalRefSchema,
    boundAt: DateTimeSchema,
    retiredBy: PrincipalRefSchema.nullable(),
    retiredAt: DateTimeSchema.nullable(),
    retireReason: z.string().nullable(),
  })
  .strict();
export type AssetPhysicalTagV1 = z.infer<typeof AssetPhysicalTagV1Schema>;

export const RetireAssetTagV1Schema = z.object({ reason: TextSchema(500) }).strict();

export const AssetTagResolutionV1Schema = z
  .object({
    tag: AssetPhysicalTagV1Schema,
    asset: z
      .object({
        id: UuidSchema,
        assetTag: z.string(),
        name: z.string(),
        status: z.string(),
        siteRef: UuidSchema.nullable(),
        spaceId: UuidSchema.nullable(),
      })
      .strict(),
  })
  .strict();
export type AssetTagResolutionV1 = z.infer<typeof AssetTagResolutionV1Schema>;

const SpecsSchema = z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean()]));

export const SubmitCommissioningRequestV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    proposedAssetTag: IdentifierSchema,
    name: TextSchema(200),
    manufacturer: TextSchema(200).optional(),
    model: TextSchema(200).optional(),
    serialNumber: TextSchema(200).optional(),
    category: TextSchema(80).optional(),
    classificationId: UuidSchema.optional(),
    parentAssetId: UuidSchema.optional(),
    spaceId: UuidSchema.optional(),
    siteRef: UuidSchema.optional(),
    departmentId: z.string().trim().min(1).max(64).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    locationAccuracyM: z.number().nonnegative().max(100_000).optional(),
    specs: SpecsSchema.optional(),
    /** Nameplate text the technician read or pasted; OCR output is only accepted once the technician confirms it. */
    nameplateText: TextSchema(2000).optional(),
    nameplateConfirmed: z.boolean().default(false),
    tag: AssetTagRefV1Schema.optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    path: ['longitude'],
    message: 'Give both latitude and longitude, or neither.',
  })
  .refine((value) => value.nameplateText === undefined || value.nameplateConfirmed, {
    path: ['nameplateConfirmed'],
    message: 'Confirm the nameplate text before submitting it.',
  });
export type SubmitCommissioningRequestV1 = z.infer<typeof SubmitCommissioningRequestV1Schema>;

export const CommissioningDuplicateV1Schema = z
  .object({
    assetId: UuidSchema,
    assetTag: z.string(),
    name: z.string(),
    reason: z.enum(['SERIAL_NUMBER', 'ASSET_TAG']),
  })
  .strict();

export const CommissioningRequestV1Schema = z
  .object({
    id: UuidSchema,
    status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']),
    decision: z.enum(['CREATED', 'LINKED', 'REJECTED']).nullable(),
    proposedAssetTag: z.string(),
    name: z.string(),
    manufacturer: z.string().nullable(),
    model: z.string().nullable(),
    serialNumber: z.string().nullable(),
    category: z.string().nullable(),
    classificationId: UuidSchema.nullable(),
    parentAssetId: UuidSchema.nullable(),
    spaceId: UuidSchema.nullable(),
    siteRef: UuidSchema.nullable(),
    departmentId: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    locationAccuracyM: z.number().nullable(),
    specs: SpecsSchema,
    nameplateText: z.string().nullable(),
    tag: z.object({ kind: AssetTagKindV1Schema, value: z.string() }).strict().nullable(),
    notes: z.string().nullable(),
    duplicates: z.array(CommissioningDuplicateV1Schema),
    submittedBy: PrincipalRefSchema,
    submittedAt: DateTimeSchema,
    reviewedBy: PrincipalRefSchema.nullable(),
    reviewedAt: DateTimeSchema.nullable(),
    reviewNote: z.string().nullable(),
    assetId: UuidSchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type CommissioningRequestV1 = z.infer<typeof CommissioningRequestV1Schema>;

export const SubmitCommissioningResultV1Schema = z
  .object({ replayed: z.boolean(), request: CommissioningRequestV1Schema })
  .strict();
export type SubmitCommissioningResultV1 = z.infer<typeof SubmitCommissioningResultV1Schema>;

export const DecideCommissioningRequestV1Schema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE_NEW'), expectedVersion: z.number().int().positive(), note: z.string().trim().max(2000).optional() }).strict(),
  z
    .object({
      decision: z.literal('LINK_EXISTING'),
      expectedVersion: z.number().int().positive(),
      assetId: UuidSchema,
      note: z.string().trim().max(2000).optional(),
    })
    .strict(),
  z.object({ decision: z.literal('REJECT'), expectedVersion: z.number().int().positive(), note: TextSchema(2000) }).strict(),
]);
export type DecideCommissioningRequestV1 = z.infer<typeof DecideCommissioningRequestV1Schema>;

export const SearchCommissioningRequestsV1Schema = z
  .object({
    status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

/** What a technician picks from on the floor: the spaces and classifications in their scope. */
export const CommissioningContextV1Schema = z
  .object({
    spaces: z
      .array(z.object({ id: UuidSchema, code: z.string(), name: z.string(), spaceType: z.string(), siteRef: UuidSchema.nullable() }).strict())
      .max(500),
    classifications: z.array(z.object({ id: UuidSchema, code: z.string(), name: z.string() }).strict()).max(500),
  })
  .strict();
export type CommissioningContextV1 = z.infer<typeof CommissioningContextV1Schema>;

// ─── Floor-walk audits ───────────────────────────────────────────────────────────────────────────────────

export const StartAssetAuditV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    label: TextSchema(120),
    spaceId: UuidSchema.optional(),
    siteRef: UuidSchema.optional(),
  })
  .strict()
  .refine((value) => value.spaceId !== undefined || value.siteRef !== undefined, {
    message: 'Walk a space or a site.',
  });
export type StartAssetAuditV1 = z.infer<typeof StartAssetAuditV1Schema>;

export const AssetAuditWalkV1Schema = z
  .object({
    id: UuidSchema,
    label: z.string(),
    spaceId: UuidSchema.nullable(),
    siteRef: UuidSchema.nullable(),
    status: z.enum(['OPEN', 'FINISHED']),
    startedBy: PrincipalRefSchema,
    startedAt: DateTimeSchema,
    finishedAt: DateTimeSchema.nullable(),
    sightingCount: z.number().int().min(0),
  })
  .strict();
export type AssetAuditWalkV1 = z.infer<typeof AssetAuditWalkV1Schema>;

export const RecordAssetSightingV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    tag: AssetTagRefV1Schema,
    spaceId: UuidSchema.optional(),
    seenAt: DateTimeSchema,
  })
  .strict();
export type RecordAssetSightingV1 = z.infer<typeof RecordAssetSightingV1Schema>;

export const AssetSightingV1Schema = z
  .object({
    id: UuidSchema,
    walkId: UuidSchema,
    kind: AssetTagKindV1Schema,
    value: z.string(),
    assetId: UuidSchema.nullable(),
    assetTag: z.string().nullable(),
    assetName: z.string().nullable(),
    spaceId: UuidSchema.nullable(),
    seenAt: DateTimeSchema,
    replayed: z.boolean(),
  })
  .strict();
export type AssetSightingV1 = z.infer<typeof AssetSightingV1Schema>;

export const AssetAuditReportV1Schema = z
  .object({
    walk: AssetAuditWalkV1Schema,
    seen: z.array(
      z
        .object({
          assetId: UuidSchema,
          assetTag: z.string(),
          name: z.string(),
          registeredSpaceId: UuidSchema.nullable(),
          seenSpaceId: UuidSchema.nullable(),
          relocated: z.boolean(),
        })
        .strict(),
    ),
    missing: z.array(z.object({ assetId: UuidSchema, assetTag: z.string(), name: z.string(), registeredSpaceId: UuidSchema.nullable() }).strict()),
    unknownTags: z.array(z.object({ kind: AssetTagKindV1Schema, value: z.string(), seenAt: DateTimeSchema }).strict()),
  })
  .strict();
export type AssetAuditReportV1 = z.infer<typeof AssetAuditReportV1Schema>;
