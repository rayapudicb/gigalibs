import { z } from 'zod';

// ─── WI-OI-138 M-SOP: visual maintenance work instructions (CMMS) ───────────────────────────────────────
// A procedure revision holds validated steps with gates and branches; an execution records one result per step in
// the order the path allows (`nextSopStep`, shared by server, web and mobile); a dual sign-off step waits for another
// user's countersign.

const UuidSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime({ offset: true });
const PrincipalRefSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/);
const TextSchema = (max: number) => z.string().trim().min(1).max(max);
const StepKeySchema = z.string().regex(/^[a-z][a-z0-9-]{0,31}$/, 'Start with a letter; use lowercase letters, digits and dashes.');
const CodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Use letters, digits, dot, underscore, slash or dash.'));

export const SOP_MAX_STEPS = 100;
export const SOP_STEP_IMAGE_MAX_BYTES = 300 * 1024;
export const SOP_PHOTO_MAX_BYTES = 500 * 1024;

export const SopGateV1Schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NONE') }).strict(),
  z.object({ type: z.literal('CONFIRM') }).strict(),
  z.object({ type: z.literal('PHOTO') }).strict(),
  z
    .object({ type: z.literal('READING'), unit: TextSchema(24), min: z.number().finite().optional(), max: z.number().finite().optional() })
    .strict()
    .refine((gate) => gate.min === undefined || gate.max === undefined || gate.min <= gate.max, { message: 'The minimum cannot exceed the maximum.' }),
  z.object({ type: z.literal('DECISION'), question: TextSchema(300) }).strict(),
]);
export type SopGateV1 = z.infer<typeof SopGateV1Schema>;

export const SopStepV1Schema = z
  .object({
    key: StepKeySchema,
    title: TextSchema(120),
    instruction: TextSchema(2000),
    gate: SopGateV1Schema,
    dualSignoff: z.boolean().default(false),
    /** Next step when there is no decision; absent means the following step in the list, null ends the procedure. */
    next: StepKeySchema.nullable().optional(),
    onYes: StepKeySchema.nullable().optional(),
    onNo: StepKeySchema.nullable().optional(),
  })
  .strict()
  .refine((step) => step.gate.type === 'DECISION' || (step.onYes === undefined && step.onNo === undefined), {
    message: 'Only a decision step branches on yes or no.',
  });
export type SopStepV1 = z.infer<typeof SopStepV1Schema>;

/** The key of the step after `index` given its answer; null ends the procedure. */
export function sopSuccessor(steps: readonly SopStepV1[], index: number, answer?: 'YES' | 'NO'): string | null {
  const step = steps[index];
  if (!step) return null;
  if (step.gate.type === 'DECISION') {
    const branch = answer === 'YES' ? step.onYes : answer === 'NO' ? step.onNo : undefined;
    if (branch !== undefined) return branch;
  }
  if (step.next !== undefined) return step.next;
  return steps[index + 1]?.key ?? null;
}

function stepIssues(steps: readonly SopStepV1[], context: z.RefinementCtx): void {
  const keys = new Map(steps.map((step, index) => [step.key, index]));
  if (keys.size !== steps.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Each step key appears once.' });
    return;
  }
  for (const [index, step] of steps.entries())
    for (const target of [step.next, step.onYes, step.onNo])
      if (target && !keys.has(target))
        context.addIssue({ code: z.ZodIssueCode.custom, path: [index], message: `Step ${step.key} points at unknown step ${target}.` });
  // No cycles: every path must end.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (key: string): boolean => {
    if (state.get(key) === 'done') return true;
    if (state.get(key) === 'visiting') return false;
    state.set(key, 'visiting');
    const index = keys.get(key)!;
    const successors = steps[index]!.gate.type === 'DECISION'
      ? [sopSuccessor(steps, index, 'YES'), sopSuccessor(steps, index, 'NO')] : [sopSuccessor(steps, index)];
    for (const successor of successors) if (successor && keys.has(successor) && !visit(successor)) return false;
    state.set(key, 'done');
    return true;
  };
  if (steps[0] && !visit(steps[0].key)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'The steps loop; every path must end.' });
}

export const SopStepsV1Schema = z.array(SopStepV1Schema).min(1).max(SOP_MAX_STEPS).superRefine(stepIssues);

export interface SopResultLike {
  readonly stepKey: string;
  readonly outcome: 'CONFIRMED' | 'ANSWER_YES' | 'ANSWER_NO' | 'READING' | 'PHOTO' | 'DONE';
  readonly cosignRequired: boolean;
  readonly cosignedBy: string | null;
}

export type SopProgress =
  | { readonly state: 'NEXT'; readonly stepKey: string }
  | { readonly state: 'AWAITING_COSIGN'; readonly stepKey: string }
  | { readonly state: 'END' };

/** Where an execution stands: the next step on the path, a countersign it waits for, or the end. */
export function nextSopStep(steps: readonly SopStepV1[], results: readonly SopResultLike[]): SopProgress {
  let key: string | null = steps[0]?.key ?? null;
  for (const result of results) {
    if (key === null || result.stepKey !== key) throw new Error(`Result for ${result.stepKey} is off the path.`);
    if (result.cosignRequired && !result.cosignedBy) return { state: 'AWAITING_COSIGN', stepKey: key };
    const index = steps.findIndex((step) => step.key === key);
    key = sopSuccessor(steps, index, result.outcome === 'ANSWER_YES' ? 'YES' : result.outcome === 'ANSWER_NO' ? 'NO' : undefined);
  }
  return key === null ? { state: 'END' } : { state: 'NEXT', stepKey: key };
}

/** The outcome a gate expects. */
export function sopOutcomeFits(gate: SopGateV1, outcome: SopResultLike['outcome']): boolean {
  switch (gate.type) {
    case 'NONE': return outcome === 'DONE';
    case 'CONFIRM': return outcome === 'CONFIRMED';
    case 'PHOTO': return outcome === 'PHOTO';
    case 'READING': return outcome === 'READING';
    case 'DECISION': return outcome === 'ANSWER_YES' || outcome === 'ANSWER_NO';
  }
}

export const CreateSopProcedureV1Schema = z
  .object({ code: CodeSchema, title: TextSchema(200), jobPlanId: UuidSchema.optional(), safetyCritical: z.boolean().default(false), steps: SopStepsV1Schema })
  .strict();
export type CreateSopProcedureV1 = z.infer<typeof CreateSopProcedureV1Schema>;

export const UpdateSopProcedureV1Schema = z
  .object({ expectedVersion: z.number().int().positive(), title: TextSchema(200).optional(), safetyCritical: z.boolean().optional(), steps: SopStepsV1Schema.optional() })
  .strict();
export const SopLifecycleV1Schema = z.object({ expectedVersion: z.number().int().positive(), note: z.string().trim().max(2000).optional() }).strict();
export const UploadSopStepImageV1Schema = z
  .object({
    expectedVersion: z.number().int().positive(),
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    base64: z.string().min(16).max(Math.ceil((SOP_STEP_IMAGE_MAX_BYTES * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();

export const SopProcedureV1Schema = z
  .object({
    id: UuidSchema,
    code: z.string(),
    title: z.string(),
    revision: z.number().int().positive(),
    status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'WITHDRAWN']),
    jobPlanId: UuidSchema.nullable(),
    safetyCritical: z.boolean(),
    steps: z.array(SopStepV1Schema),
    stepImages: z.array(StepKeySchema),
    authoredBy: PrincipalRefSchema,
    submittedBy: PrincipalRefSchema.nullable(),
    approvedBy: PrincipalRefSchema.nullable(),
    approvedAt: DateTimeSchema.nullable(),
    reviewNote: z.string().nullable(),
    version: z.number().int().positive(),
    updatedAt: DateTimeSchema,
  })
  .strict();
export type SopProcedureV1 = z.infer<typeof SopProcedureV1Schema>;

export const StartSopExecutionV1Schema = z
  .object({ clientOperationId: UuidSchema, procedureId: UuidSchema, workOrderId: UuidSchema.optional(), assetId: UuidSchema.optional() })
  .strict();
export type StartSopExecutionV1 = z.infer<typeof StartSopExecutionV1Schema>;

export const RecordSopStepV1Schema = z
  .object({
    clientOperationId: UuidSchema,
    stepKey: StepKeySchema,
    outcome: z.enum(['CONFIRMED', 'ANSWER_YES', 'ANSWER_NO', 'READING', 'PHOTO', 'DONE']),
    reading: z.number().finite().optional(),
    photoContentType: z.enum(['image/png', 'image/jpeg', 'image/webp']).optional(),
    photoBase64: z.string().min(16).max(Math.ceil((SOP_PHOTO_MAX_BYTES * 4) / 3) + 4).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
    recordedAt: DateTimeSchema,
  })
  .strict()
  .refine((value) => (value.outcome === 'READING') === (value.reading !== undefined), { message: 'A reading step carries its reading.' })
  .refine((value) => (value.outcome === 'PHOTO') === (value.photoBase64 !== undefined && value.photoContentType !== undefined), {
    message: 'A photo step carries its photo.',
  });
export type RecordSopStepV1 = z.infer<typeof RecordSopStepV1Schema>;

export const SopFeedbackInputV1Schema = z.object({ stepKey: StepKeySchema, text: TextSchema(2000) }).strict();
export const ResolveSopFeedbackV1Schema = z.object({ note: TextSchema(2000) }).strict();

export const SopStepResultV1Schema = z
  .object({
    sequence: z.number().int().positive(),
    stepKey: z.string(),
    outcome: z.enum(['CONFIRMED', 'ANSWER_YES', 'ANSWER_NO', 'READING', 'PHOTO', 'DONE']),
    reading: z.number().nullable(),
    withinLimits: z.boolean().nullable(),
    hasPhoto: z.boolean(),
    recordedBy: PrincipalRefSchema,
    recordedAt: DateTimeSchema,
    cosignRequired: z.boolean(),
    cosignedBy: PrincipalRefSchema.nullable(),
    cosignedAt: DateTimeSchema.nullable(),
  })
  .strict();
export type SopStepResultV1 = z.infer<typeof SopStepResultV1Schema>;

export const SopExecutionV1Schema = z
  .object({
    id: UuidSchema,
    procedureId: UuidSchema,
    procedureCode: z.string(),
    revision: z.number().int().positive(),
    workOrderId: UuidSchema.nullable(),
    assetId: UuidSchema.nullable(),
    executedBy: PrincipalRefSchema,
    status: z.enum(['IN_PROGRESS', 'COMPLETED']),
    startedAt: DateTimeSchema,
    completedAt: DateTimeSchema.nullable(),
    results: z.array(SopStepResultV1Schema),
    progress: z.discriminatedUnion('state', [
      z.object({ state: z.literal('NEXT'), stepKey: z.string() }).strict(),
      z.object({ state: z.literal('AWAITING_COSIGN'), stepKey: z.string() }).strict(),
      z.object({ state: z.literal('END') }).strict(),
    ]),
    version: z.number().int().positive(),
  })
  .strict();
export type SopExecutionV1 = z.infer<typeof SopExecutionV1Schema>;

export const SopExecutionResultV1Schema = z.object({ replayed: z.boolean(), execution: SopExecutionV1Schema }).strict();
export type SopExecutionResultV1 = z.infer<typeof SopExecutionResultV1Schema>;

export const SopFeedbackV1Schema = z
  .object({
    id: UuidSchema,
    procedureId: UuidSchema,
    procedureCode: z.string(),
    revision: z.number().int().positive(),
    stepKey: z.string(),
    text: z.string(),
    status: z.enum(['OPEN', 'RESOLVED']),
    raisedBy: PrincipalRefSchema,
    raisedAt: DateTimeSchema,
    resolvedBy: PrincipalRefSchema.nullable(),
    resolutionNote: z.string().nullable(),
  })
  .strict();
export type SopFeedbackV1 = z.infer<typeof SopFeedbackV1Schema>;

export const SopStepDurationsV1Schema = z
  .object({
    procedureId: UuidSchema,
    executions: z.number().int().min(0),
    steps: z.array(z.object({ stepKey: z.string(), samples: z.number().int(), averageSeconds: z.number(), outOfLimits: z.number().int() }).strict()),
  })
  .strict();
export type SopStepDurationsV1 = z.infer<typeof SopStepDurationsV1Schema>;
