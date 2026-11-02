import { z } from 'zod';

// ─── WI-OI-137 M-LOG: operator shift logbook, safety bypass register and two-person handover (Workforce) ──
// Entries never change (a correction is a new entry); a bypass is authorized by someone other than its requester; a
// handover is submitted by the outgoing operator with a frozen package and accepted by a different incoming operator
// who acknowledges every active bypass. Sign-offs are recorded statements, not regulated e-signatures.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');
const CodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, dot, underscore, slash or dash.'));
const TimeZoneSchema = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}, 'Use an IANA time zone.');

export const LOGBOOK_OUTGOING_STATEMENT = 'I certify that this turnover describes the unit conditions accurately.';
export const LOGBOOK_INCOMING_STATEMENT = 'I reviewed this turnover and every active bypass, and I accept custody of the unit.';
export const LOGBOOK_SUPERVISOR_STATEMENT = 'I reviewed this handover and countersign it.';
export const BYPASS_ALERT_HOURS = 48;

export const ShiftWindowV1Schema = z.object({ name: TextSchema(40), start: ClockSchema, end: ClockSchema }).strict()
  .refine((window) => window.start !== window.end, { message: 'A shift has a length.' });

const ShiftWindowsSchema = z
  .array(ShiftWindowV1Schema)
  .min(1)
  .max(6)
  .refine((windows) => new Set(windows.map((window) => window.name.toLowerCase())).size === windows.length, {
    message: 'Each shift has its own name.',
  });

export const CreateLogbookV1Schema = z
  .object({
    code: CodeSchema,
    name: TextSchema(200),
    departmentId: z.string().trim().min(1).max(64).optional(),
    siteRef: UuidSchema.optional(),
    timeZone: TimeZoneSchema,
    shiftWindows: ShiftWindowsSchema,
  })
  .strict();
export type CreateLogbookV1 = z.infer<typeof CreateLogbookV1Schema>;

export const UpdateLogbookV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: TextSchema(200).optional(),
    shiftWindows: ShiftWindowsSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const LogbookV1Schema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    name: z.string(),
    departmentId: z.string().nullable(),
    siteRef: UuidSchema.nullable(),
    timeZone: z.string(),
    shiftWindows: z.array(ShiftWindowV1Schema),
    active: z.boolean(),
    version: z.number().int().positive(),
    updatedAt: DateTimeSchema,
  })
  .strict();
export type LogbookV1 = z.infer<typeof LogbookV1Schema>;

export const LogbookShiftV1Schema = z
  .object({ shiftDate: DateSchema, shiftName: z.string(), startsAt: DateTimeSchema, endsAt: DateTimeSchema })
  .strict();
export type LogbookShiftV1 = z.infer<typeof LogbookShiftV1Schema>;

export const LogEntryCategoryV1Schema = z.enum([
  'NOTE', 'EQUIPMENT_STATE', 'TRIP', 'CHEMICAL_DOSE', 'STANDING_ALARM', 'FEEDSTOCK_CHANGE', 'SAFETY',
]);

export const CreateLogEntryV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    category: LogEntryCategoryV1Schema,
    text: TextSchema(2000),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']).default('NORMAL'),
    assetRef: UuidSchema.optional(),
    occurredAt: DateTimeSchema,
    correctsEntryId: UuidSchema.optional(),
  })
  .strict();
export type CreateLogEntryV1 = z.infer<typeof CreateLogEntryV1Schema>;

export const LogEntryV1Schema = z
  .object({
    id: UuidSchema,
    logbookId: UuidSchema,
    shiftDate: DateSchema,
    shiftName: z.string(),
    category: LogEntryCategoryV1Schema,
    text: z.string(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH']),
    assetRef: UuidSchema.nullable(),
    occurredAt: DateTimeSchema,
    recordedAt: DateTimeSchema,
    author: PrincipalRefSchema,
    correctsEntryId: UuidSchema.nullable(),
    correctedByEntryId: UuidSchema.nullable(),
  })
  .strict();
export type LogEntryV1 = z.infer<typeof LogEntryV1Schema>;

export const CreateLogEntryResultV1Schema = z.object({ replayed: z.boolean(), entry: LogEntryV1Schema }).strict();
export type CreateLogEntryResultV1 = z.infer<typeof CreateLogEntryResultV1Schema>;

export const RequestBypassV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    description: TextSchema(500),
    assetRef: UuidSchema.optional(),
    reason: TextSchema(1000),
    mitigation: TextSchema(1000),
    plannedRemovalAt: DateTimeSchema,
  })
  .strict();
export type RequestBypassV1 = z.infer<typeof RequestBypassV1Schema>;

export const DecideBypassV1Schema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('AUTHORIZE'), expectedVersion: z.number().int().positive(), note: z.string().trim().max(1000).optional() }).strict(),
  z.object({ decision: z.literal('REJECT'), expectedVersion: z.number().int().positive(), note: TextSchema(1000) }).strict(),
]);
export type DecideBypassV1 = z.infer<typeof DecideBypassV1Schema>;

export const ClearBypassV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), note: z.string().trim().max(1000).optional() })
  .strict();

export const BypassV1Schema = z
  .object({
    id: UuidSchema,
    logbookId: UuidSchema,
    description: z.string(),
    assetRef: UuidSchema.nullable(),
    reason: z.string(),
    mitigation: z.string(),
    status: z.enum(['REQUESTED', 'AUTHORIZED', 'CLEARED', 'REJECTED']),
    requestedBy: PrincipalRefSchema,
    requestedAt: DateTimeSchema,
    plannedRemovalAt: DateTimeSchema,
    authorizedBy: PrincipalRefSchema.nullable(),
    authorizedAt: DateTimeSchema.nullable(),
    clearedBy: PrincipalRefSchema.nullable(),
    clearedAt: DateTimeSchema.nullable(),
    decisionNote: z.string().nullable(),
    /** Hours since authorization for an active bypass; null otherwise. */
    activeHours: z.number().nullable(),
    /** Active past its planned removal or for more than 48 hours. */
    overdue: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
export type BypassV1 = z.infer<typeof BypassV1Schema>;

export const HandoverPackageV1Schema = z
  .object({
    frozenAt: DateTimeSchema,
    entryCounts: z.record(LogEntryCategoryV1Schema, z.number().int().min(0)),
    highPriorityEntries: z.array(z.object({ id: UuidSchema, category: LogEntryCategoryV1Schema, text: z.string(), occurredAt: DateTimeSchema }).strict()).max(100),
    activeBypasses: z.array(
      z.object({ id: UuidSchema, description: z.string(), authorizedAt: DateTimeSchema, plannedRemovalAt: DateTimeSchema }).strict(),
    ).max(200),
    pendingBypasses: z.number().int().min(0),
  })
  .strict();
export type HandoverPackageV1 = z.infer<typeof HandoverPackageV1Schema>;

export const SubmitHandoverV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    shiftDate: DateSchema,
    shiftName: TextSchema(40),
    notes: TextSchema(4000),
    statement: z.literal(LOGBOOK_OUTGOING_STATEMENT),
  })
  .strict();
export type SubmitHandoverV1 = z.infer<typeof SubmitHandoverV1Schema>;

export const RefreezeHandoverV1Schema = z.object({ expectedVersion: z.number().int().positive() }).strict();

export const AcceptHandoverV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    acknowledgedBypassIds: z.array(UuidSchema).max(200),
    statement: z.literal(LOGBOOK_INCOMING_STATEMENT),
  })
  .strict();
export type AcceptHandoverV1 = z.infer<typeof AcceptHandoverV1Schema>;

export const CountersignHandoverV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), statement: z.literal(LOGBOOK_SUPERVISOR_STATEMENT) })
  .strict();

export const HandoverV1Schema = z
  .object({
    id: UuidSchema,
    logbookId: UuidSchema,
    shiftDate: DateSchema,
    shiftName: z.string(),
    status: z.enum(['SUBMITTED', 'ACCEPTED', 'COUNTERSIGNED']),
    outgoingBy: PrincipalRefSchema,
    submittedAt: DateTimeSchema,
    outgoingStatement: z.string(),
    notes: z.string(),
    package: HandoverPackageV1Schema,
    incomingBy: PrincipalRefSchema.nullable(),
    acceptedAt: DateTimeSchema.nullable(),
    incomingStatement: z.string().nullable(),
    acknowledgedBypassIds: z.array(UuidSchema),
    supervisorBy: PrincipalRefSchema.nullable(),
    countersignedAt: DateTimeSchema.nullable(),
    supervisorStatement: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type HandoverV1 = z.infer<typeof HandoverV1Schema>;

export const SubmitHandoverResultV1Schema = z.object({ replayed: z.boolean(), handover: HandoverV1Schema }).strict();
export type SubmitHandoverResultV1 = z.infer<typeof SubmitHandoverResultV1Schema>;

export const LogbookBoardV1Schema = z
  .object({
    logbook: LogbookV1Schema,
    currentShift: LogbookShiftV1Schema,
    entries: z.array(LogEntryV1Schema).max(200),
    activeBypasses: z.array(BypassV1Schema),
    pendingBypasses: z.array(BypassV1Schema),
    openHandover: HandoverV1Schema.nullable(),
    lastHandover: HandoverV1Schema.nullable(),
  })
  .strict();
export type LogbookBoardV1 = z.infer<typeof LogbookBoardV1Schema>;
