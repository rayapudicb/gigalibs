import { z } from 'zod'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
)

const JsonObjectSchema = z.record(z.string(), JsonValueSchema)

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(128),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  data: JsonObjectSchema.optional(),
  config: JsonObjectSchema.optional(),
})

export const WorkflowEdgeSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  source: z.string().min(1).max(128),
  target: z.string().min(1).max(128),
})

export const WorkflowGraphSchema = z.object({
  nodes: z.array(WorkflowNodeSchema).max(500),
  edges: z.array(WorkflowEdgeSchema).max(2_000),
})

export const CreateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).optional(),
  targetApp: z.string().trim().min(1).max(160),
  definition: WorkflowGraphSchema,
})

export const UpdateWorkflowDraftSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  targetApp: z.string().trim().min(1).max(160).optional(),
  definition: WorkflowGraphSchema,
})

export const PublishWorkflowSchema = z.object({
  definition: WorkflowGraphSchema,
  inputSchema: JsonObjectSchema.default({}),
  outputSchema: JsonObjectSchema.default({}),
})

export const TriggerWorkflowRunSchema = z.object({
  pipelineId: z.string().min(1).max(128),
  inputPayload: JsonObjectSchema.optional(),
})

export const ExecutionAuditEventSchema = z.object({
  eventId: z.string().min(1).max(128),
  eventType: z.enum([
    'execution.run.requested.v1',
    'execution.run.started.v1',
    'execution.run.resumed.v1',
    'execution.run.succeeded.v1',
    'execution.run.failed.v1',
    'execution.run.cancelled.v1',
    'execution.run.action_required.v1',
    'execution.action.succeeded.v1',
    'execution.step.failed.v1',
  ]),
  tenantId: z.string().min(1).max(128),
  runId: z.string().min(1).max(128),
  workflowId: z.string().min(1).max(128),
  correlationId: z.string().min(1).max(128),
  actorId: z.string().min(1).max(128).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }),
  evidence: JsonObjectSchema,
})

export type WorkflowGraphDto = z.infer<typeof WorkflowGraphSchema>
export type CreateWorkflowDto = z.infer<typeof CreateWorkflowSchema>
export type UpdateWorkflowDraftDto = z.infer<typeof UpdateWorkflowDraftSchema>
export type PublishWorkflowDto = z.infer<typeof PublishWorkflowSchema>
export type TriggerWorkflowRunDto = z.infer<typeof TriggerWorkflowRunSchema>
export type ExecutionAuditEventDto = z.infer<typeof ExecutionAuditEventSchema>
