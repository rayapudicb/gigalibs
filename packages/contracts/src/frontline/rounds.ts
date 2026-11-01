import { z } from 'zod';

/** WI-OI-133. These are the wire contracts; tenant and actor never come from request bodies. */
export const RoundRouteStateV1 = z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']);
export const RoundReadingKindV1 = z.enum(['NUMERIC', 'CHOICE', 'BOOLEAN']);
export const RoundProofModeV1 = z.enum(['NFC', 'BARCODE', 'EITHER']);
export const RoundReadingSourceV1 = z.literal('MANUAL');
export const RoundReadingStatusV1 = z.enum(['NORMAL', 'AMBER', 'RED']);

const identifier = z.string().trim().min(1).max(128);
const decimal = z.string().regex(/^-?\d{1,12}(?:\.\d{1,6})?$/);
const label = z.string().trim().min(1).max(200);
const validTimeZone=(value:string) => {
  try {new Intl.DateTimeFormat('en-US',{timeZone:value});return true;}
  catch {return false;}
};

export const RoundScheduleV1 = z.object({
  cadence: z.enum(['DAILY', 'PER_SHIFT', 'WEEKLY']),
  timeZone: z.string().min(1).max(64).refine(validTimeZone,'Use a supported time zone.'),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  graceMinutes: z.number().int().min(0).max(1440),
  windowMinutes: z.number().int().min(1).max(1440),
}).strict().superRefine((value, issue) => {
  if (value.cadence === 'WEEKLY' && (!value.weekdays || value.weekdays.length === 0))
    issue.addIssue({ code: 'custom', path: ['weekdays'], message: 'Choose at least one weekday.' });
  if (value.cadence !== 'PER_SHIFT' && !value.localTime)
    issue.addIssue({ code: 'custom', path: ['localTime'], message: 'A local time is required.' });
});

export const RoundBranchRuleV1 = z.discriminatedUnion('condition', [
  z.object({ condition: z.literal('ALWAYS'), nextPosition: z.number().int().positive() }).strict(),
  z.object({ condition: z.literal('VALUE_EQUALS'), value: z.string().min(1).max(64), nextPosition: z.number().int().positive() }).strict(),
  z.object({ condition: z.literal('STATUS_IS'), value: RoundReadingStatusV1, nextPosition: z.number().int().positive() }).strict(),
]);

export const RoundCheckpointDraftV1 = z.object({
  id: z.uuid().optional(),
  position: z.number().int().positive().max(1000),
  label,
  assetRef: z.uuid(),
  meterRef: z.uuid().nullable(),
  tagCode: identifier,
  proofMode: RoundProofModeV1,
  readingKind: RoundReadingKindV1,
  unitCode: z.string().trim().min(1).max(32).nullable(),
  nominal: decimal.nullable(),
  amberLow: decimal.nullable(),
  amberHigh: decimal.nullable(),
  redLow: decimal.nullable(),
  redHigh: decimal.nullable(),
  choices: z.array(z.string().trim().min(1).max(64)).max(12),
  branchRules: z.array(RoundBranchRuleV1).max(8),
  instructions: z.string().max(4000).nullable(),
  photoOnException: z.boolean(),
}).strict();

export const CreateRoundRouteV1 = z.object({
  requestKey: z.uuid(),
  code: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/),
  title: label,
  description: z.string().max(4000).nullable(),
  owningUnitId: identifier.nullable(),
  placeRef: z.uuid().nullable(),
  schedule: RoundScheduleV1,
}).strict();

export const UpdateRoundRouteV1 = z.object({
  version: z.number().int().positive(),
  title: label.optional(),
  description: z.string().max(4000).nullable().optional(),
  owningUnitId: identifier.nullable().optional(),
  placeRef: z.uuid().nullable().optional(),
  schedule: RoundScheduleV1.optional(),
}).strict().refine((value) => Object.keys(value).length > 1, 'Supply a changed field.');

export const ReplaceRoundCheckpointsV1 = z.object({
  routeVersion: z.number().int().positive(),
  checkpoints: z.array(RoundCheckpointDraftV1).min(1).max(1000),
}).strict();

/**
 * One bounded batch of a draft route's checkpoints. A large route travels as several batches (each body stays under the
 * module host's request limit) and replaces the saved checkpoints only when FinalizeRoundCheckpointsV1 succeeds.
 */
export const StageRoundCheckpointBatchV1 = z.object({
  routeVersion: z.number().int().positive(),
  uploadId: z.uuid(),
  batchIndex: z.number().int().min(0).max(999),
  batchCount: z.number().int().min(1).max(1000),
  checkpoints: z.array(RoundCheckpointDraftV1).min(1).max(1000),
}).strict().refine((value) => value.batchIndex < value.batchCount, 'batchIndex must be below batchCount.');

/** Atomically replaces the draft's checkpoints with every staged batch of one upload. */
export const FinalizeRoundCheckpointsV1 = z.object({
  routeVersion: z.number().int().positive(),
  uploadId: z.uuid(),
  batchCount: z.number().int().min(1).max(1000),
  checkpointCount: z.number().int().min(1).max(1000),
}).strict();

export const AssignRoundV1 = z.object({
  requestKey: z.uuid(),
  workforceResourceRef: z.uuid(),
  operatorSubject: identifier,
  scheduledStart: z.iso.datetime({ offset: true }),
  dueAt: z.iso.datetime({ offset: true }),
}).strict();

/** Published-route roster contains references only; Workforce remains the authority for worker eligibility. */
export const RoundRosterEntryV1 = z.object({
  workforceResourceRef:z.uuid(),operatorSubject:identifier,
}).strict();
export const ReplaceRoundRosterV1 = z.object({
  expectedVersion:z.number().int().min(0),
  entries:z.array(RoundRosterEntryV1).max(10),
}).strict().superRefine((value,issue) => {
  const resources=value.entries.map((entry) => entry.workforceResourceRef);
  const subjects=value.entries.map((entry) => entry.operatorSubject);
  if (new Set(resources).size!==resources.length || new Set(subjects).size!==subjects.length)
    issue.addIssue({code:'custom',message:'Each Workforce resource and operator may appear only once.'});
});
export const GenerateRoundAssignmentsV1 = z.object({
  localDate:z.iso.date(),rosterVersion:z.number().int().positive(),
}).strict();

export const StartRoundRunV1 = z.object({
  requestKey: z.uuid(),
  runId: z.uuid(),
  assignmentId: z.uuid(),
  routeRevision: z.number().int().positive(),
}).strict();

export const CaptureRoundReadingV1 = z.object({
  clientOperationId: z.uuid(),
  runId: z.uuid(),
  checkpointId: z.uuid(),
  routeRevision: z.number().int().positive(),
  expectedRunVersion: z.number().int().positive(),
  capturedAt: z.iso.datetime({ offset: true }),
  source: RoundReadingSourceV1,
  proofMethod: z.enum(['NFC', 'BARCODE']),
  scannedTag: identifier,
  numericValue: decimal.nullable(),
  choiceValue: z.string().min(1).max(64).nullable(),
  evidenceId: z.uuid().nullable(),
}).strict().superRefine((value, issue) => {
  if ((value.numericValue === null) === (value.choiceValue === null))
    issue.addIssue({ code: 'custom', message: 'Supply exactly one reading value.' });
});

export const CompleteRoundRunV1 = z.object({
  clientOperationId: z.uuid(),
  runId: z.uuid(),
  expectedRunVersion: z.number().int().positive(),
}).strict();

export const RoundSkipReasonV1 = z.enum(['INACCESSIBLE', 'UNSAFE', 'ASSET_OUT_OF_SERVICE', 'TAG_DAMAGED', 'OTHER']);

/**
 * An ad-hoc defect seen during a run (product spec 01 §2): no reading, the operator's description and an optional photo
 * bound to this assignment and checkpoint. It does not change the run's route path or version. With requestWorkOrder it
 * asks CMMS for one corrective work order; without, it waits for supervisor review.
 */
export const ReportRoundDefectV1 = z.object({
  clientOperationId: z.uuid(),
  runId: z.uuid(),
  checkpointId: z.uuid(),
  routeRevision: z.number().int().positive(),
  observedAt: z.iso.datetime({ offset: true }),
  severity: z.enum(['AMBER', 'RED']),
  description: z.string().trim().min(1).max(2000),
  requestWorkOrder: z.boolean(),
  evidenceId: z.uuid().nullable(),
}).strict();

/**
 * Passing the expected checkpoint without a reading. It is a step of the route path (the route's ALWAYS branch or the
 * next position) and stays REQUESTED until a different person with operator-rounds.skips.approve decides it.
 */
export const RequestRoundSkipV1 = z.object({
  clientOperationId: z.uuid(),
  runId: z.uuid(),
  checkpointId: z.uuid(),
  routeRevision: z.number().int().positive(),
  expectedRunVersion: z.number().int().positive(),
  capturedAt: z.iso.datetime({ offset: true }),
  reasonCode: RoundSkipReasonV1,
  note: z.string().trim().min(1).max(1000).nullable(),
}).strict().refine((value) => value.reasonCode !== 'OTHER' || value.note !== null, 'Describe the reason for OTHER.');

export const DecideRoundSkipV1 = z.object({
  version: z.number().int().positive(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().min(1).max(2000),
}).strict();

export const RoundSyncCommandTypeV1 = z.enum(['START', 'READING', 'DEFECT', 'SKIP', 'COMPLETE']);

export const RoundSyncCommandV1 = z.discriminatedUnion('type', [
  z.object({ type: z.literal('START'), payload: StartRoundRunV1 }).strict(),
  z.object({ type: z.literal('READING'), payload: CaptureRoundReadingV1 }).strict(),
  z.object({ type: z.literal('DEFECT'), payload: ReportRoundDefectV1 }).strict(),
  z.object({ type: z.literal('SKIP'), payload: RequestRoundSkipV1 }).strict(),
  z.object({ type: z.literal('COMPLETE'), payload: CompleteRoundRunV1 }).strict(),
]);

export const RoundSyncBatchV1 = z.object({
  commands: z.array(RoundSyncCommandV1).min(1).max(25),
}).strict();

/** One result per submitted command, in order. A failed command stops dependent later commands. */
export const RoundSyncResultV1 = z.discriminatedUnion('accepted', [
  z.object({ accepted: z.literal(true), type: RoundSyncCommandTypeV1,
    operationId: z.uuid(), replayed: z.boolean(), result: z.record(z.string(),z.unknown()) }).strict(),
  z.object({ accepted: z.literal(false), type: RoundSyncCommandTypeV1,
    operationId: z.uuid(), state: z.enum(['CONFLICT','REJECTED','NOT_APPLIED']),
    code: z.enum(['VERSION_CONFLICT','WORKFORCE_CHANGED','INVALID_COMMAND','NOT_FOUND','EARLIER_COMMAND_FAILED']),
    retryable: z.boolean() }).strict(),
]);
export const RoundSyncResponseV1 = z.object({
  results: z.array(RoundSyncResultV1).min(1).max(25),
  stopped: z.boolean(),
}).strict();
export type RoundSyncResponseV1 = z.infer<typeof RoundSyncResponseV1>;

/** Read-only, bounded manual inspection history for an assigned route. No operator or photo data. */
export const RoundCheckpointHistoryV1 = z.object({
  contractVersion:z.literal('round-checkpoint-history.v1'),
  assignmentId:z.uuid(),routeRevision:z.number().int().positive(),
  items:z.array(z.object({
    checkpointId:z.uuid(),
    readings:z.array(z.object({
      readingId:z.uuid(),capturedAt:z.iso.datetime({offset:true}),
      numericValue:decimal.nullable(),choiceValue:z.string().min(1).max(64).nullable(),
      status:RoundReadingStatusV1,source:RoundReadingSourceV1,
    }).strict().refine((reading) => (reading.numericValue === null) !== (reading.choiceValue === null),
      'Exactly one historical value is required.')).max(5),
  }).strict()).max(1000),
}).strict().superRefine((value,issue) => {
  if (new Set(value.items.map((item) => item.checkpointId)).size!==value.items.length)
    issue.addIssue({code:'custom',message:'Duplicate checkpoint history.'});
});
export type RoundCheckpointHistoryV1 = z.infer<typeof RoundCheckpointHistoryV1>;

/** Analytics-owned daily numeric inspection trend; fixed 90-day window and one checkpoint. */
export const RoundInspectionTrendQueryV1 = z.object({
  assetId:z.uuid(),checkpointId:z.uuid(),unitCode:z.string().trim().min(1).max(32),
}).strict();
export const RoundInspectionTrendV1 = z.object({
  contractVersion:z.literal('round-inspection-trend.v1'),
  assetId:z.uuid(),checkpointId:z.uuid(),unitCode:z.string().trim().min(1).max(32),
  from:z.iso.date(),to:z.iso.date(),generatedAt:z.iso.datetime({offset:true}),
  source:z.literal('ANALYTICS_ROUNDS_FACTS'),
  days:z.array(z.object({
    day:z.iso.date(),unitCode:z.string().min(1).max(32),
    average:decimal,minimum:decimal,maximum:decimal,
    sampleCount:z.number().int().positive(),
    lastAcceptedAt:z.iso.datetime({offset:true}),
  }).strict()).max(90),
}).strict();
export type RoundInspectionTrendV1 = z.infer<typeof RoundInspectionTrendV1>;

export const StageRoundEvidenceV1 = z.object({
  evidenceId: z.uuid(),
  assignmentId: z.uuid(),
  checkpointId: z.uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().min(1).max(10_000_000),
}).strict();

/** Only the Rounds-owned fields needed before the BFF issues a bounded offline capture grant. */
export const RoundOfflineGrantBundleSourceV1 = z.object({
  assignment:z.object({
    id:z.uuid(),operatorSubject:identifier,routeRevision:z.number().int().positive(),
    dueAt:z.iso.datetime({offset:true}),state:z.enum(['ASSIGNED','STARTED','COMPLETED','MISSED','CANCELLED']),
  }).passthrough(),
  route:z.object({
    revision:z.number().int().positive(),
    schedule:z.object({graceMinutes:z.number().int().min(0).max(1440)}).passthrough(),
  }).passthrough(),
}).passthrough();

/** HTTPS-authenticated grant; server auth and assignment scope are checked again at sync. */
export const RoundOfflineGrantV1 = z.object({
  contractVersion:z.literal('round-offline-grant.v1'),grantId:z.uuid(),
  assignmentId:z.uuid(),routeRevision:z.number().int().positive(),
  scopeKey:z.string().regex(/^[a-f0-9]{64}$/),
  tenantId:identifier,userId:identifier,membershipId:identifier,installationId:z.uuid(),
  sessionRevision:z.number().int().nonnegative(),
  authorizationRevision:z.number().int().nonnegative(),
  configurationRevision:z.number().int().nonnegative(),
  issuedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
}).strict().refine((value) => {
  const duration=Date.parse(value.expiresAt)-Date.parse(value.issuedAt);
  return duration>0 && duration<=8*60*60*1000;
},'Offline grant must expire within eight hours.');
export type RoundOfflineGrantV1 = z.infer<typeof RoundOfflineGrantV1>;

export const ReviewRoundExceptionV1 = z.object({
  version: z.number().int().positive(),
  note: z.string().trim().min(1).max(2000),
  resolution: z.enum(['ACKNOWLEDGED','RESOLVED']),
}).strict();

export const RetryRoundCorrectiveActionV1 = z.object({
  version:z.number().int().positive(),
  note:z.string().trim().min(1).max(2000),
}).strict();
export type RetryRoundCorrectiveActionV1 = z.infer<typeof RetryRoundCorrectiveActionV1>;

/** Signed Rounds → CMMS command. CMMS owns the resulting work order. */
export const RoundCorrectiveActionV1 = z.object({
  requestKey: z.uuid(),
  exceptionId: z.uuid(),
  // Commands relayed before defects existed carry no origin: they are threshold exceptions.
  origin: z.enum(['READING', 'DEFECT']).default('READING'),
  readingId: z.uuid().nullable(),
  runId: z.uuid(),
  routeId: z.uuid(),
  checkpointId: z.uuid(),
  assetId: z.uuid(),
  placeRef: z.uuid().nullable(),
  severity: z.enum(['AMBER', 'RED']),
  checkpointLabel: label,
  observedAt: z.iso.datetime({ offset: true }),
  reading: z.object({
    numericValue: decimal.nullable(),
    choiceValue: z.string().min(1).max(64).nullable(),
    unitCode: z.string().min(1).max(32).nullable(),
  }).strict().nullable(),
  defectDescription: z.string().trim().min(1).max(2000).nullable().default(null),
}).strict().superRefine((value, issue) => {
  const reading = value.readingId !== null && value.reading !== null && value.defectDescription === null;
  const defect = value.readingId === null && value.reading === null && value.defectDescription !== null;
  if (value.origin === 'READING' ? !reading : !defect)
    issue.addIssue({ code: 'custom', message: 'A corrective action carries a reading or a defect description, as its origin says.' });
});
export type RoundCorrectiveActionV1 = z.infer<typeof RoundCorrectiveActionV1>;

/** Signed Rounds → CMMS context query for checkpoints already authorized by the Rounds assignment. */
export const RoundMeterContextRequestV1 = z.object({
  assignmentId:z.uuid(),
  checkpoints:z.array(z.object({
    checkpointId:z.uuid(),assetId:z.uuid(),meterId:z.uuid(),placeRef:z.uuid().nullable(),
  }).strict()).min(1).max(100),
}).strict();
export type RoundMeterContextRequestV1 = z.infer<typeof RoundMeterContextRequestV1>;
export const RoundMeterContextResponseV1 = z.object({
  items:z.array(z.object({
    checkpointId:z.uuid(),meterId:z.uuid(),status:z.enum(['AVAILABLE','NO_READING','NOT_FOUND']),
    value:decimal.nullable(),unitCode:z.string().min(1).max(32).nullable(),
    readAt:z.iso.datetime({offset:true}).nullable(),
    source:z.enum(['MANUAL','IOT_TELEMETRY','CONNECTOR_HUB','SCADA']).nullable(),
  }).strict()).max(100),
}).strict();
export type RoundMeterContextResponseV1 = z.infer<typeof RoundMeterContextResponseV1>;

/** Signed Rounds → Workforce authority check before assigning a route. */
export const RoundWorkforceEligibilityRequestV1 = z.object({
  resourceId:z.uuid(),operatorSubject:identifier,
  owningUnitId:identifier.nullable(),placeRef:z.uuid().nullable(),
  timeZone:z.string().min(1).max(64),
  scheduledStart:z.iso.datetime({offset:true}),dueAt:z.iso.datetime({offset:true}),
}).strict().refine((value) => Date.parse(value.dueAt) > Date.parse(value.scheduledStart) &&
  Date.parse(value.dueAt) - Date.parse(value.scheduledStart) <= 24*60*60*1000,
  'Assignment window must be positive and no longer than 24 hours.');
export const RoundWorkforceEligibilityResponseV1 = z.object({
  eligible:z.boolean(),
  code:z.enum(['ACTIVE_LINK','RESOURCE_UNKNOWN','RESOURCE_INACTIVE','USER_MISMATCH',
    'POSITION_MISMATCH','SHIFT_UNAVAILABLE','APPROVED_ABSENCE','SITE_CLOSED']),
}).strict().refine((value) => value.eligible === (value.code==='ACTIVE_LINK'),
  'Eligibility must match the Workforce reason code.');
export type RoundWorkforceEligibilityRequestV1 = z.infer<typeof RoundWorkforceEligibilityRequestV1>;
export type RoundWorkforceEligibilityResponseV1 = z.infer<typeof RoundWorkforceEligibilityResponseV1>;

/** Signed Workforce source windows for one roster member and route-local date. */
export const RoundWorkforceShiftWindowsRequestV1 = z.object({
  resourceId:z.uuid(),operatorSubject:identifier,localDate:z.iso.date(),
  timeZone:z.string().min(1).max(64),
}).strict();
export const RoundWorkforceShiftWindowsResponseV1 = z.object({
  windows:z.array(z.object({
    scheduledStart:z.iso.datetime({offset:true}),shiftEnd:z.iso.datetime({offset:true}),
  }).strict()).max(8),
}).strict();
export type RoundWorkforceShiftWindowsRequestV1 = z.infer<typeof RoundWorkforceShiftWindowsRequestV1>;
export type RoundWorkforceShiftWindowsResponseV1 = z.infer<typeof RoundWorkforceShiftWindowsResponseV1>;

export type RoundCheckpointDraftV1 = z.infer<typeof RoundCheckpointDraftV1>;
export type CaptureRoundReadingV1 = z.infer<typeof CaptureRoundReadingV1>;
export type CreateRoundRouteV1 = z.infer<typeof CreateRoundRouteV1>;
export type RoundScheduleV1 = z.infer<typeof RoundScheduleV1>;
export type AssignRoundV1 = z.infer<typeof AssignRoundV1>;
export type ReplaceRoundRosterV1 = z.infer<typeof ReplaceRoundRosterV1>;
export type StageRoundCheckpointBatchV1 = z.infer<typeof StageRoundCheckpointBatchV1>;
export type ReportRoundDefectV1 = z.infer<typeof ReportRoundDefectV1>;
export type RequestRoundSkipV1 = z.infer<typeof RequestRoundSkipV1>;
export type DecideRoundSkipV1 = z.infer<typeof DecideRoundSkipV1>;
export type FinalizeRoundCheckpointsV1 = z.infer<typeof FinalizeRoundCheckpointsV1>;
export type RoundRosterEntryV1 = z.infer<typeof RoundRosterEntryV1>;
export type GenerateRoundAssignmentsV1 = z.infer<typeof GenerateRoundAssignmentsV1>;
export type StartRoundRunV1 = z.infer<typeof StartRoundRunV1>;
export type CompleteRoundRunV1 = z.infer<typeof CompleteRoundRunV1>;
export type RoundSyncCommandV1 = z.infer<typeof RoundSyncCommandV1>;
export type StageRoundEvidenceV1 = z.infer<typeof StageRoundEvidenceV1>;
export type ReviewRoundExceptionV1 = z.infer<typeof ReviewRoundExceptionV1>;
