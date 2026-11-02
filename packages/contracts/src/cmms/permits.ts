import { z } from 'zod';

// ─── WI-OI-142 M-LOTO: lockout/tagout and permit-to-work (CMMS M-CM2) ───────────────────────────────────
// A permit pins a published isolation procedure; each point is locked (serial and photo) and verified at zero energy;
// approval needs three different people; workers sign their personal lock on and off while the permit is live.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const KeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'Start with a letter; use lowercase letters, digits and dashes.');
const TagSchema = z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/));
const CodeSchema = TagSchema;
const RasterSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const PERMIT_PHOTO_MAX_BYTES = 300 * 1024;
export const PERMIT_MAX_HOURS = 12;
export const GAS_TEST_MAX_AGE_MINUTES = 120;
export const EnergyTypeV1Schema = z.enum(['ELECTRICAL', 'PNEUMATIC', 'HYDRAULIC', 'THERMAL', 'CHEMICAL', 'MECHANICAL', 'GRAVITY']);
export const WorkPermitTypeV1Schema = z.enum(['LOTO', 'HOT_WORK', 'CONFINED_SPACE', 'LINE_BREAK', 'HIGH_VOLTAGE']);
export type WorkPermitTypeV1 = z.infer<typeof WorkPermitTypeV1Schema>;
export const WorkPermitStatusV1Schema = z.enum(['DRAFT', 'ISOLATING', 'AWAITING_APPROVAL', 'LIVE', 'DE_ISOLATING', 'CLOSED', 'CANCELLED']);
export type WorkPermitStatusV1 = z.infer<typeof WorkPermitStatusV1Schema>;
/** Permit types whose atmosphere is tested before approval. */
export const GAS_TESTED_TYPES: readonly WorkPermitTypeV1[] = ['HOT_WORK', 'CONFINED_SPACE'];

export const IsolationPointV1Schema = z
  .object({ key: KeySchema, label: TextSchema(160), energy: EnergyTypeV1Schema, isolationTag: TagSchema, method: TextSchema(500) })
  .strict();
export type IsolationPointV1 = z.infer<typeof IsolationPointV1Schema>;
export const IsolationPointsV1Schema = z
  .array(IsolationPointV1Schema)
  .min(1)
  .max(60)
  .refine((points) => new Set(points.map((point) => point.key)).size === points.length, { message: 'Each point key appears once.' });

export const CreateIsolationProcedureV1Schema = z
  .object({ code: CodeSchema, title: TextSchema(200), assetId: UuidSchema.optional(), points: IsolationPointsV1Schema })
  .strict();
export const UpdateIsolationProcedureV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), title: TextSchema(200).optional(), points: IsolationPointsV1Schema.optional() })
  .strict();
export const PermitVersionV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export const IsolationProcedureV1Schema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    title: z.string(),
    revision: z.number().int().positive(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'RETIRED']),
    assetId: UuidSchema.nullable(),
    points: z.array(IsolationPointV1Schema),
    authoredBy: PrincipalRefSchema,
    publishedBy: PrincipalRefSchema.nullable(),
    version: z.number().int().positive(),
    updatedAt: DateTimeSchema,
  })
  .strict();
export type IsolationProcedureV1 = z.infer<typeof IsolationProcedureV1Schema>;

export const RequestPermitV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    type: WorkPermitTypeV1Schema,
    procedureId: UuidSchema,
    workOrderId: UuidSchema.optional(),
    title: TextSchema(200),
    description: TextSchema(2000).optional(),
    validFrom: DateTimeSchema,
    validUntil: DateTimeSchema,
  })
  .strict()
  .refine((input) => Date.parse(input.validUntil) > Date.parse(input.validFrom), { message: 'A permit ends after it starts.' })
  .refine((input) => Date.parse(input.validUntil) - Date.parse(input.validFrom) <= PERMIT_MAX_HOURS * 3_600_000, {
    message: 'A permit is valid for at most 12 hours.',
  });

export const LockIsolationV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    lockSerial: TextSchema(64),
    photoContentType: RasterSchema,
    photoBase64: z.string().min(16).max(Math.ceil((PERMIT_PHOTO_MAX_BYTES * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
/** The try step: the person who locked it tried to start the equipment and nothing energised. */
export const VerifyIsolationV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), zeroEnergyConfirmed: z.literal(true) })
  .strict();
export const GasTestV1InputSchema = z
  .object({
    clientOperationId: UuidSchema,
    oxygenPercent: z.number().min(0).max(100),
    lelPercent: z.number().min(0).max(100),
    coPpm: z.number().min(0).max(10_000),
    h2sPpm: z.number().min(0).max(10_000),
    testedAt: DateTimeSchema,
  })
  .strict();
export const PermitDecisionV1Schema = z.object({ expectedVersion: z.number().int().positive(), note: TextSchema(1000).optional() }).strict();
export const CancelPermitV1Schema = z.object({ expectedVersion: z.number().int().positive(), reason: TextSchema(1000) }).strict();

/** Safe-entry limits: O₂ 19.5–23.5 %, LEL ≤ 10 %, CO ≤ 25 ppm, H₂S ≤ 5 ppm. */
export function gasWithinLimits(test: { oxygenPercent: number; lelPercent: number; coPpm: number; h2sPpm: number }) {
  const flags = [
    ...(test.oxygenPercent < 19.5 || test.oxygenPercent > 23.5 ? ['OXYGEN'] : []),
    ...(test.lelPercent > 10 ? ['LEL'] : []),
    ...(test.coPpm > 25 ? ['CO'] : []),
    ...(test.h2sPpm > 5 ? ['H2S'] : []),
  ] as const;
  return { withinLimits: flags.length === 0, flags: [...flags] as ('OXYGEN' | 'LEL' | 'CO' | 'H2S')[] };
}

export const PermitIsolationV1Schema = z
  .object({
    pointKey: z.string(),
    label: z.string(),
    energy: EnergyTypeV1Schema,
    isolationTag: z.string(),
    method: z.string(),
    sequence: z.number().int(),
    status: z.enum(['PENDING', 'LOCKED', 'VERIFIED', 'REMOVED']),
    lockSerial: z.string().nullable(),
    lockedBy: PrincipalRefSchema.nullable(),
    lockedAt: DateTimeSchema.nullable(),
    hasPhoto: z.boolean(),
    verifiedBy: PrincipalRefSchema.nullable(),
    witnessedBy: PrincipalRefSchema.nullable(),
    verifiedAt: DateTimeSchema.nullable(),
    removedBy: PrincipalRefSchema.nullable(),
    removedAt: DateTimeSchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type PermitIsolationV1 = z.infer<typeof PermitIsolationV1Schema>;

export const GasTestV1Schema = z
  .object({
    id: UuidSchema,
    oxygenPercent: z.number(),
    lelPercent: z.number(),
    coPpm: z.number(),
    h2sPpm: z.number(),
    withinLimits: z.boolean(),
    flags: z.array(z.enum(['OXYGEN', 'LEL', 'CO', 'H2S'])),
    testedBy: PrincipalRefSchema,
    testedAt: DateTimeSchema,
  })
  .strict();
export type GasTestV1 = z.infer<typeof GasTestV1Schema>;

export const PermitV1Schema = z
  .object({
    id: UuidSchema,
    number: z.string(),
    type: WorkPermitTypeV1Schema,
    status: WorkPermitStatusV1Schema,
    title: z.string(),
    description: z.string().nullable(),
    procedureId: UuidSchema,
    procedureCode: z.string(),
    procedureRevision: z.number().int(),
    workOrderId: UuidSchema.nullable(),
    assetId: UuidSchema.nullable(),
    validFrom: DateTimeSchema,
    validUntil: DateTimeSchema,
    requestedBy: PrincipalRefSchema,
    authorizedBy: PrincipalRefSchema.nullable(),
    countersignedBy: PrincipalRefSchema.nullable(),
    liveAt: DateTimeSchema.nullable(),
    closedBy: PrincipalRefSchema.nullable(),
    closedAt: DateTimeSchema.nullable(),
    cancelReason: z.string().nullable(),
    isolations: z.array(PermitIsolationV1Schema),
    gasTests: z.array(GasTestV1Schema),
    personalLocks: z.array(z.object({ subject: PrincipalRefSchema, since: DateTimeSchema }).strict()),
    clashes: z.array(z.object({ permitId: UuidSchema, number: z.string(), status: WorkPermitStatusV1Schema, isolationTag: z.string() }).strict()),
    version: z.number().int().positive(),
  })
  .strict();
export type PermitV1 = z.infer<typeof PermitV1Schema>;
export const RequestPermitResultV1Schema = z.object({ replayed: z.boolean(), permit: PermitV1Schema }).strict();
