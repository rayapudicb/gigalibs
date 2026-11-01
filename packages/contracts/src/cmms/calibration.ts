import { z } from 'zod';

// ─── WI-OI-134 M-CAL: field instrument calibration (CMMS extension) ─────────────────────────────────────
// Instruments are CMMS assets. A published, versioned profile defines ranges, transfer function, tolerance and test
// points; a technician submits measured outputs against valid master standards; the server recomputes every point
// with `evaluateCalibration` (the same function the mobile app and the web use for live feedback) and stores the
// immutable record. A different user approves it before a certificate exists. No regulated e-signature is claimed.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const CodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, dot, underscore, slash or dash.'));
const UnitSchema = TextSchema(24);
/** Engineering values: finite, bounded, at most six decimals are kept. */
const ValueSchema = z.number().finite().gt(-1e9).lt(1e9);

export const CALIBRATION_DECIMALS = 6;
export const CALIBRATION_MAX_POINTS = 21;
export const CALIBRATION_MAX_STANDARDS = 5;

/** Fixed sign-off statements; the record stores the statement each signer accepted. */
export const CALIBRATION_TECHNICIAN_STATEMENT =
  'I performed this calibration with the listed standards, and the readings are as measured.';
export const CALIBRATION_APPROVAL_STATEMENT =
  'I reviewed this calibration record and its standards, and I approve the result.';
export const CALIBRATION_REJECTION_STATEMENT = 'I reviewed this calibration record, and I reject it.';

export const CalibrationTransferV1Schema = z.enum(['LINEAR', 'SQUARE_ROOT']);
export const CalibrationToleranceModeV1Schema = z.enum(['PERCENT_SPAN', 'ABSOLUTE']);
export const CalibrationProfileStatusV1Schema = z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED']);
export const CalibrationStandardStatusV1Schema = z.enum(['ACTIVE', 'WITHDRAWN']);
export const CalibrationPhaseV1Schema = z.enum(['AS_FOUND', 'AS_LEFT']);
export const CalibrationPhaseResultV1Schema = z.enum(['PASS', 'FAIL']);
export const CalibrationOverallResultV1Schema = z.enum(['PASS', 'ADJUSTED', 'FAIL']);
export const CalibrationRecordStatusV1Schema = z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']);
export const CalibrationDueStateV1Schema = z.enum(['NEVER', 'OVERDUE', 'DUE_SOON', 'CURRENT']);

const DefinitionFields = {
  inputLrv: ValueSchema,
  inputUrv: ValueSchema,
  inputUnit: UnitSchema,
  outputLrv: ValueSchema,
  outputUrv: ValueSchema,
  outputUnit: UnitSchema,
  transfer: CalibrationTransferV1Schema.default('LINEAR'),
  toleranceMode: CalibrationToleranceModeV1Schema.default('PERCENT_SPAN'),
  toleranceValue: z.number().finite().positive().max(1e6),
  /** Test points as percent of the input range, strictly ascending, 0–100. */
  testPoints: z.array(z.number().finite().min(0).max(100)).min(2).max(CALIBRATION_MAX_POINTS),
  intervalDays: z.number().int().min(1).max(3650),
  procedure: z.string().trim().max(4000).optional(),
};

function definitionIssues(
  value: { inputLrv: number; inputUrv: number; outputLrv: number; outputUrv: number; testPoints: readonly number[] },
  context: z.RefinementCtx,
): void {
  if (!(value.inputUrv > value.inputLrv))
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['inputUrv'], message: 'The input upper value must exceed the lower value.' });
  if (value.outputUrv === value.outputLrv)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['outputUrv'], message: 'The output range must have a span.' });
  for (let index = 1; index < value.testPoints.length; index += 1) {
    if (!(value.testPoints[index]! > value.testPoints[index - 1]!)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['testPoints', index], message: 'Test points must ascend.' });
      return;
    }
  }
}

export const CalibrationDefinitionV1Schema = z.object(DefinitionFields).strict().superRefine(definitionIssues);
export type CalibrationDefinitionV1 = z.infer<typeof CalibrationDefinitionV1Schema>;

export const CreateCalibrationProfileV1Schema = z
  .object({ assetId: UuidSchema, ...DefinitionFields })
  .strict()
  .superRefine(definitionIssues);
export type CreateCalibrationProfileV1 = z.infer<typeof CreateCalibrationProfileV1Schema>;

export const UpdateCalibrationProfileV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), ...DefinitionFields })
  .strict()
  .superRefine(definitionIssues);
export type UpdateCalibrationProfileV1 = z.infer<typeof UpdateCalibrationProfileV1Schema>;

export const PublishCalibrationProfileV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export const CalibrationProfileV1Schema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema,
    assetTag: z.string(),
    assetName: z.string(),
    revision: z.number().int().positive(),
    status: CalibrationProfileStatusV1Schema,
    definition: CalibrationDefinitionV1Schema,
    authoredBy: PrincipalRefSchema,
    publishedBy: PrincipalRefSchema.nullable(),
    publishedAt: DateTimeSchema.nullable(),
    version: z.number().int().positive(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  })
  .strict();
export type CalibrationProfileV1 = z.infer<typeof CalibrationProfileV1Schema>;

const StandardFields = {
  code: CodeSchema,
  name: TextSchema(200),
  serialNumber: z.string().trim().max(200).optional(),
  manufacturer: z.string().trim().max(200).optional(),
  model: z.string().trim().max(200).optional(),
  accuracyStatement: z.string().trim().max(500).optional(),
  certificateNumber: TextSchema(120),
  issuedBy: TextSchema(200),
  calibratedOn: DateSchema,
  validUntil: DateSchema,
  siteRef: UuidSchema.optional(),
  departmentId: z.string().trim().min(1).max(64).optional(),
};

export const CreateCalibrationStandardV1Schema = z
  .object(StandardFields)
  .strict()
  .refine((value) => value.validUntil >= value.calibratedOn, {
    path: ['validUntil'],
    message: 'The certificate must be valid on or after its calibration date.',
  });
export type CreateCalibrationStandardV1 = z.infer<typeof CreateCalibrationStandardV1Schema>;

/** A recertification replaces the certificate fields; a withdrawal stops new use. Code and scope do not change. */
export const UpdateCalibrationStandardV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: TextSchema(200).optional(),
    accuracyStatement: z.string().trim().max(500).optional(),
    certificateNumber: TextSchema(120).optional(),
    issuedBy: TextSchema(200).optional(),
    calibratedOn: DateSchema.optional(),
    validUntil: DateSchema.optional(),
    status: CalibrationStandardStatusV1Schema.optional(),
  })
  .strict();
export type UpdateCalibrationStandardV1 = z.infer<typeof UpdateCalibrationStandardV1Schema>;

export const CalibrationStandardV1Schema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    name: z.string(),
    serialNumber: z.string().nullable(),
    manufacturer: z.string().nullable(),
    model: z.string().nullable(),
    accuracyStatement: z.string().nullable(),
    certificateNumber: z.string(),
    issuedBy: z.string(),
    calibratedOn: DateSchema,
    validUntil: DateSchema,
    status: CalibrationStandardStatusV1Schema,
    siteRef: UuidSchema.nullable(),
    departmentId: z.string().nullable(),
    /** ACTIVE and valid today (UTC) when read. */
    usable: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: DateTimeSchema,
  })
  .strict();
export type CalibrationStandardV1 = z.infer<typeof CalibrationStandardV1Schema>;

const MeasuredPointSchema = z
  .object({
    position: z.number().int().min(0).max(CALIBRATION_MAX_POINTS - 1),
    measuredOutput: ValueSchema,
    /** The input actually applied, when it differs from the nominal test point. */
    appliedInput: ValueSchema.optional(),
  })
  .strict();
export type CalibrationMeasuredPointV1 = z.infer<typeof MeasuredPointSchema>;

const MeasuredPhaseSchema = z
  .array(MeasuredPointSchema)
  .min(2)
  .max(CALIBRATION_MAX_POINTS)
  .refine((points) => points.every((point, index) => point.position === index), {
    message: 'Points must be given in position order, one per test point.',
  });

export const SubmitCalibrationRecordV1Schema = z
  .object({
    /** Stable per capture; a repeated submit with the same id returns the stored record. */
    clientOperationId: UuidSchema,
    assetId: UuidSchema,
    profileId: UuidSchema,
    profileRevision: z.number().int().positive(),
    workOrderId: UuidSchema.optional(),
    standardIds: z
      .array(UuidSchema)
      .min(1)
      .max(CALIBRATION_MAX_STANDARDS)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'Name each standard once.' }),
    startedAt: DateTimeSchema,
    completedAt: DateTimeSchema,
    asFound: MeasuredPhaseSchema,
    asLeft: MeasuredPhaseSchema.optional(),
    notes: z.string().trim().max(2000).optional(),
    statement: z.literal(CALIBRATION_TECHNICIAN_STATEMENT),
  })
  .strict()
  .refine((value) => Date.parse(value.completedAt) >= Date.parse(value.startedAt), {
    path: ['completedAt'],
    message: 'The calibration cannot finish before it started.',
  });
export type SubmitCalibrationRecordV1 = z.infer<typeof SubmitCalibrationRecordV1Schema>;

export const DecideCalibrationRecordV1Schema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('APPROVE'),
      expectedVersion: z.number().int().positive(),
      note: z.string().trim().max(2000).optional(),
      statement: z.literal(CALIBRATION_APPROVAL_STATEMENT),
    })
    .strict(),
  z
    .object({
      decision: z.literal('REJECT'),
      expectedVersion: z.number().int().positive(),
      note: TextSchema(2000),
      statement: z.literal(CALIBRATION_REJECTION_STATEMENT),
    })
    .strict(),
]);
export type DecideCalibrationRecordV1 = z.infer<typeof DecideCalibrationRecordV1Schema>;

export const CalibrationPointResultV1Schema = z
  .object({
    phase: CalibrationPhaseV1Schema,
    position: z.number().int().min(0),
    nominalPercent: z.number(),
    appliedInput: z.number(),
    expectedOutput: z.number(),
    measuredOutput: z.number(),
    errorAbsolute: z.number(),
    errorPercentSpan: z.number(),
    withinTolerance: z.boolean(),
  })
  .strict();
export type CalibrationPointResultV1 = z.infer<typeof CalibrationPointResultV1Schema>;

export const CalibrationRecordStandardV1Schema = z
  .object({ id: UuidSchema, code: z.string(), name: z.string(), certificateNumber: z.string(), validUntil: DateSchema })
  .strict();

export const CalibrationRecordV1Schema = z
  .object({
    id: UuidSchema,
    assetId: UuidSchema,
    assetTag: z.string(),
    assetName: z.string(),
    profileId: UuidSchema,
    profileRevision: z.number().int().positive(),
    definition: CalibrationDefinitionV1Schema,
    workOrderId: UuidSchema.nullable(),
    technician: PrincipalRefSchema,
    startedAt: DateTimeSchema,
    completedAt: DateTimeSchema,
    receivedAt: DateTimeSchema,
    status: CalibrationRecordStatusV1Schema,
    asFoundResult: CalibrationPhaseResultV1Schema,
    asLeftResult: CalibrationPhaseResultV1Schema.nullable(),
    overallResult: CalibrationOverallResultV1Schema,
    /** As-found failed: product made with this instrument since its last calibration needs an impact review. */
    impactReviewRequired: z.boolean(),
    standards: z.array(CalibrationRecordStandardV1Schema),
    points: z.array(CalibrationPointResultV1Schema),
    notes: z.string().nullable(),
    technicianStatement: z.string(),
    recordSha256: z.string().regex(/^[0-9a-f]{64}$/),
    correctiveWorkOrderId: UuidSchema.nullable(),
    assetTakenOffline: z.boolean(),
    decidedBy: PrincipalRefSchema.nullable(),
    decidedAt: DateTimeSchema.nullable(),
    decisionNote: z.string().nullable(),
    decisionStatement: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type CalibrationRecordV1 = z.infer<typeof CalibrationRecordV1Schema>;

/** A replayed submit (same client operation id and body) returns the stored record with `replayed: true`. */
export const SubmitCalibrationResultV1Schema = z
  .object({ replayed: z.boolean(), record: CalibrationRecordV1Schema })
  .strict();
export type SubmitCalibrationResultV1 = z.infer<typeof SubmitCalibrationResultV1Schema>;

export const SearchCalibrationRecordsV1Schema = z
  .object({
    assetId: UuidSchema.optional(),
    status: CalibrationRecordStatusV1Schema.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const CalibrationInstrumentV1Schema = z
  .object({
    assetId: UuidSchema,
    assetTag: z.string(),
    assetName: z.string(),
    assetStatus: z.string(),
    siteRef: UuidSchema.nullable(),
    departmentId: z.string().nullable(),
    profileId: UuidSchema,
    profileRevision: z.number().int().positive(),
    intervalDays: z.number().int().positive(),
    lastCalibratedAt: DateTimeSchema.nullable(),
    lastResult: CalibrationOverallResultV1Schema.nullable(),
    nextDueAt: DateTimeSchema.nullable(),
    dueState: CalibrationDueStateV1Schema,
    awaitingApproval: z.number().int().min(0),
  })
  .strict();
export type CalibrationInstrumentV1 = z.infer<typeof CalibrationInstrumentV1Schema>;

/** Everything a technician needs to calibrate one instrument, offline if necessary. */
export const CalibrationInstrumentBundleV1Schema = z
  .object({
    contractVersion: z.literal('calibration-bundle.v1'),
    generatedAt: DateTimeSchema,
    instrument: CalibrationInstrumentV1Schema,
    profile: CalibrationProfileV1Schema,
    standards: z.array(CalibrationStandardV1Schema).max(200),
  })
  .strict();
export type CalibrationInstrumentBundleV1 = z.infer<typeof CalibrationInstrumentBundleV1Schema>;

export const CalibrationCertificateV1Schema = z
  .object({
    contractVersion: z.literal('calibration-certificate.v1'),
    certificateNumber: z.string(),
    issuedAt: DateTimeSchema,
    record: CalibrationRecordV1Schema,
    disclaimer: z.string(),
  })
  .strict();
export type CalibrationCertificateV1 = z.infer<typeof CalibrationCertificateV1Schema>;

export const CalibrationDriftV1Schema = z
  .object({
    assetId: UuidSchema,
    outputUnit: z.string().nullable(),
    series: z
      .array(
        z
          .object({
            recordId: UuidSchema,
            completedAt: DateTimeSchema,
            profileRevision: z.number().int().positive(),
            overallResult: CalibrationOverallResultV1Schema,
            points: z.array(z.object({ nominalPercent: z.number(), asFoundErrorPercentSpan: z.number() }).strict()),
          })
          .strict(),
      )
      .max(200),
  })
  .strict();
export type CalibrationDriftV1 = z.infer<typeof CalibrationDriftV1Schema>;

// ─── Shared calibration math ─────────────────────────────────────────────────────────────────────────────

/** Rounds to six decimals; never returns -0. */
export function roundCalibration(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const TOLERANCE_EPSILON = 1e-9;

type Definition = Pick<
  CalibrationDefinitionV1,
  'inputLrv' | 'inputUrv' | 'outputLrv' | 'outputUrv' | 'transfer' | 'toleranceMode' | 'toleranceValue' | 'testPoints'
>;

/** The nominal input and the ideal output at a test point (percent of the input range). */
export function calibrationNominal(definition: Definition, nominalPercent: number): { input: number; output: number } {
  const input = definition.inputLrv + (nominalPercent / 100) * (definition.inputUrv - definition.inputLrv);
  return { input: roundCalibration(input), output: roundCalibration(idealOutput(definition, input)) };
}

function idealOutput(definition: Definition, appliedInput: number): number {
  const fraction = (appliedInput - definition.inputLrv) / (definition.inputUrv - definition.inputLrv);
  const span = definition.outputUrv - definition.outputLrv;
  return definition.transfer === 'SQUARE_ROOT'
    ? definition.outputLrv + Math.sqrt(Math.max(fraction, 0)) * span
    : definition.outputLrv + fraction * span;
}

/** One point: expected output from the applied input, error in output units and in percent of output span. */
export function evaluateCalibrationPoint(
  definition: Definition,
  phase: z.infer<typeof CalibrationPhaseV1Schema>,
  position: number,
  measuredOutput: number,
  appliedInput?: number,
): CalibrationPointResultV1 {
  const nominalPercent = definition.testPoints[position];
  if (nominalPercent === undefined) throw new RangeError(`No test point at position ${position}.`);
  const applied = appliedInput ?? calibrationNominal(definition, nominalPercent).input;
  const expected = idealOutput(definition, applied);
  const errorAbsolute = measuredOutput - expected;
  const errorPercentSpan = (errorAbsolute / Math.abs(definition.outputUrv - definition.outputLrv)) * 100;
  const roundedAbsolute = roundCalibration(errorAbsolute);
  const roundedPercent = roundCalibration(errorPercentSpan);
  const compared = definition.toleranceMode === 'ABSOLUTE' ? roundedAbsolute : roundedPercent;
  return {
    phase,
    position,
    nominalPercent,
    appliedInput: roundCalibration(applied),
    expectedOutput: roundCalibration(expected),
    measuredOutput: roundCalibration(measuredOutput),
    errorAbsolute: roundedAbsolute,
    errorPercentSpan: roundedPercent,
    withinTolerance: Math.abs(compared) <= definition.toleranceValue + TOLERANCE_EPSILON,
  };
}

export interface CalibrationEvaluationV1 {
  readonly asFoundResult: 'PASS' | 'FAIL';
  readonly asLeftResult: 'PASS' | 'FAIL' | null;
  readonly overallResult: 'PASS' | 'ADJUSTED' | 'FAIL';
  readonly impactReviewRequired: boolean;
  readonly points: readonly CalibrationPointResultV1[];
}

/**
 * Evaluates a calibration: as-found PASS is PASS; an as-found FAIL needs as-left readings, which make it ADJUSTED when
 * they all pass and FAIL otherwise. As-left readings after a passing as-found are kept and must pass too.
 */
export function evaluateCalibration(
  definition: Definition,
  asFound: readonly CalibrationMeasuredPointV1[],
  asLeft?: readonly CalibrationMeasuredPointV1[],
): CalibrationEvaluationV1 {
  const count = definition.testPoints.length;
  if (asFound.length !== count) throw new RangeError(`As-found needs ${count} points.`);
  if (asLeft && asLeft.length !== count) throw new RangeError(`As-left needs ${count} points.`);
  const found = asFound.map((point) =>
    evaluateCalibrationPoint(definition, 'AS_FOUND', point.position, point.measuredOutput, point.appliedInput));
  const left = (asLeft ?? []).map((point) =>
    evaluateCalibrationPoint(definition, 'AS_LEFT', point.position, point.measuredOutput, point.appliedInput));
  const asFoundResult = found.every((point) => point.withinTolerance) ? 'PASS' : 'FAIL';
  const asLeftResult = asLeft ? (left.every((point) => point.withinTolerance) ? 'PASS' : 'FAIL') : null;
  const overallResult =
    asFoundResult === 'PASS'
      ? asLeftResult === 'FAIL' ? 'FAIL' : 'PASS'
      : asLeftResult === 'PASS' ? 'ADJUSTED' : 'FAIL';
  return { asFoundResult, asLeftResult, overallResult, impactReviewRequired: asFoundResult === 'FAIL', points: [...found, ...left] };
}
