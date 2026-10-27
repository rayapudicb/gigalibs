import { z } from 'zod';

// WI-OI-120bc (AI agent + generative UI): the contract for GigaLibs' agentic product. An agent runs a goal-directed
// CAMPAIGN — a planned sequence of steps it executes by calling the platform's tools — and reports back by emitting a
// GENERATIVE UI: a declarative, allow-listed description of a screen (never arbitrary HTML or code). The web renders
// that description with vetted components. This module is the PURE core: the protocol types, the generative-UI safety
// validator, and the campaign state machine. Model calls, tool execution and rendering are thin layers on top.

/** The Claude models the agent runs on. Default to the most capable; a cheaper model is offered for light turns. */
export const AGENT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];
export const DEFAULT_AGENT_MODEL: AgentModel = 'claude-opus-5-5';

// ─── Conversation protocol ───────────────────────────────────────────────────

export const AgentRoleSchema = z.enum(['user', 'assistant', 'tool']);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

/** One entry in the running transcript the model is given each turn. */
export interface AgentMessage {
  readonly role: AgentRole;
  readonly content: string;
}

/** A tool the agent may call. `input` is a JSON-Schema-shaped descriptor the model is given; execution is elsewhere. */
export interface AgentToolSpec {
  readonly name: string;
  readonly description: string;
  readonly input: Readonly<Record<string, unknown>>;
  /** The permission a caller must hold for the agent to invoke this tool on their behalf (least privilege). */
  readonly requiresPermission: string;
}

export const AgentToolCallSchema = z
  .object({
    id: z.string().min(1),
    tool: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
  })
  .strict();
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;

export const AgentToolResultSchema = z
  .object({
    callId: z.string().min(1),
    ok: z.boolean(),
    /** Compact, model-facing summary of the result (not the raw payload). */
    summary: z.string().max(4000),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;

// ─── Generative UI — a safe, allow-listed screen description ────────────────────

/** How deep a generative-UI tree may nest, and how many nodes it may hold — a renderer-independent safety bound. */
export const GENERATIVE_UI_MAX_DEPTH = 6;
export const GENERATIVE_UI_MAX_NODES = 200;

/**
 * The closed set of components the agent may emit. Each maps to one vetted web component; there is no "raw html" or
 * "script" kind by design, so a model can never inject markup or behaviour — only structured, typed content.
 */
export const GENERATIVE_UI_KINDS = [
  'heading',
  'text',
  'note',
  'stat',
  'fields',
  'table',
  'actions',
  'group',
] as const;
export type GenerativeUIKind = (typeof GENERATIVE_UI_KINDS)[number];

const ToneSchema = z.enum(['default', 'muted', 'success', 'warning', 'danger']);

/** One action button. Pressing it sends `actionId` back to the agent — it never carries a URL or code. */
const GenerativeUIActionSchema = z
  .object({
    label: z.string().min(1).max(80),
    actionId: z.string().min(1).max(120),
    style: z.enum(['primary', 'secondary', 'danger']).optional(),
  })
  .strict();
export type GenerativeUIAction = z.infer<typeof GenerativeUIActionSchema>;

export type GenerativeUINode =
  | { readonly kind: 'heading'; readonly text: string; readonly level: 1 | 2 | 3 }
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly tone?: z.infer<typeof ToneSchema> | undefined;
    }
  | { readonly kind: 'note'; readonly text: string; readonly tone: z.infer<typeof ToneSchema> }
  | {
      readonly kind: 'stat';
      readonly label: string;
      readonly value: string;
      readonly delta?: string | undefined;
    }
  | {
      readonly kind: 'fields';
      readonly items: ReadonlyArray<{ readonly label: string; readonly value: string }>;
    }
  | {
      readonly kind: 'table';
      readonly columns: readonly string[];
      readonly rows: ReadonlyArray<readonly string[]>;
    }
  | { readonly kind: 'actions'; readonly items: readonly GenerativeUIAction[] }
  | {
      readonly kind: 'group';
      readonly heading?: string | undefined;
      readonly children: readonly GenerativeUINode[];
    };

export const GenerativeUINodeSchema: z.ZodType<GenerativeUINode> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('heading'),
        text: z.string().min(1).max(200),
        level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      })
      .strict(),
    z
      .object({
        kind: z.literal('text'),
        text: z.string().min(1).max(4000),
        tone: ToneSchema.optional(),
      })
      .strict(),
    z
      .object({ kind: z.literal('note'), text: z.string().min(1).max(2000), tone: ToneSchema })
      .strict(),
    z
      .object({
        kind: z.literal('stat'),
        label: z.string().min(1).max(120),
        value: z.string().min(1).max(120),
        delta: z.string().max(120).optional(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('fields'),
        items: z
          .array(
            z.object({ label: z.string().min(1).max(120), value: z.string().max(2000) }).strict(),
          )
          .max(60),
      })
      .strict(),
    z
      .object({
        kind: z.literal('table'),
        columns: z.array(z.string().max(120)).min(1).max(12),
        rows: z.array(z.array(z.string().max(2000)).max(12)).max(200),
      })
      .strict(),
    z
      .object({
        kind: z.literal('actions'),
        items: z.array(GenerativeUIActionSchema).min(1).max(8),
      })
      .strict(),
    z
      .object({
        kind: z.literal('group'),
        heading: z.string().max(200).optional(),
        children: z.array(GenerativeUINodeSchema).max(50),
      })
      .strict(),
  ]),
);

export interface GenerativeUIValidation {
  readonly ok: boolean;
  /** Present when `ok` is false: why the description was rejected. */
  readonly reason?: string;
}

/**
 * Validate a generative-UI description before it is rendered or stored: it must parse against the allow-list AND stay
 * within the depth and node-count bounds. Returns a reason on failure instead of throwing, so a bad model output is a
 * handled refusal, not a crash.
 */
export function validateGenerativeUI(node: unknown): GenerativeUIValidation {
  const parsed = GenerativeUINodeSchema.safeParse(node);
  if (!parsed.success) return { ok: false, reason: 'not a valid generative-UI node' };
  let count = 0;
  const walk = (n: GenerativeUINode, depth: number): string | null => {
    count += 1;
    if (depth > GENERATIVE_UI_MAX_DEPTH) return `nesting exceeds ${GENERATIVE_UI_MAX_DEPTH}`;
    if (count > GENERATIVE_UI_MAX_NODES) return `node count exceeds ${GENERATIVE_UI_MAX_NODES}`;
    if (n.kind === 'group') {
      for (const child of n.children) {
        const err = walk(child, depth + 1);
        if (err) return err;
      }
    }
    return null;
  };
  const err = walk(parsed.data, 1);
  return err ? { ok: false, reason: err } : { ok: true };
}

// ─── Agent turn — the structured decision the model returns ─────────────────────

/** A single planned step the model proposes (a title, and optionally the tool that runs it). */
const PlannedStepSchema = z
  .object({
    title: z.string().min(1).max(200),
    tool: z.string().min(1).optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** The one decision a Companion turn yields: propose a plan, call tools, show a panel, ask, or finish. */
export const AgentDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan'), steps: z.array(PlannedStepSchema).min(1).max(30) }).strict(),
  z
    .object({ kind: z.literal('tool_calls'), calls: z.array(AgentToolCallSchema).min(1).max(8) })
    .strict(),
  z
    .object({ kind: z.literal('show'), ui: GenerativeUINodeSchema, done: z.boolean().optional() })
    .strict(),
  z.object({ kind: z.literal('ask'), question: z.string().min(1).max(2000) }).strict(),
  z.object({ kind: z.literal('done'), summary: z.string().min(1).max(4000) }).strict(),
]);
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

/** Parse a model's raw decision, returning a reason instead of throwing on bad output. */
export function parseAgentDecision(
  raw: unknown,
): { ok: true; decision: AgentDecision } | { ok: false; reason: string } {
  const parsed = AgentDecisionSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, decision: parsed.data }
    : { ok: false, reason: 'the model did not return a valid decision' };
}

// ─── Campaign — the goal-directed unit of agent work ───────────────────────────

export const AgentStepStatusSchema = z.enum(['PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED']);
export type AgentStepStatus = z.infer<typeof AgentStepStatusSchema>;

export const AgentCampaignStatusSchema = z.enum([
  'PLANNING',
  'RUNNING',
  'BLOCKED',
  'DONE',
  'FAILED',
  'CANCELLED',
]);
export type AgentCampaignStatus = z.infer<typeof AgentCampaignStatusSchema>;

export interface AgentStep {
  readonly id: string;
  readonly title: string;
  readonly status: AgentStepStatus;
  /** The tool the step runs, if any (a step may be plan-only). */
  readonly toolCall?: AgentToolCall;
  readonly result?: AgentToolResult;
}

export interface AgentCampaign {
  readonly id: string;
  readonly goal: string;
  readonly status: AgentCampaignStatus;
  readonly steps: readonly AgentStep[];
  readonly createdBy: string;
}

/** The transitions the campaign reducer accepts. Each names a step by id where relevant. */
export type AgentCampaignEvent =
  | { readonly type: 'START' }
  | { readonly type: 'STEP_STARTED'; readonly stepId: string }
  | { readonly type: 'STEP_SUCCEEDED'; readonly stepId: string; readonly result: AgentToolResult }
  | { readonly type: 'STEP_FAILED'; readonly stepId: string; readonly result: AgentToolResult }
  | { readonly type: 'STEP_SKIPPED'; readonly stepId: string }
  | { readonly type: 'CANCEL' };

const STEP_TERMINAL: ReadonlySet<AgentStepStatus> = new Set(['DONE', 'FAILED', 'SKIPPED']);
/** True once a campaign can no longer change on its own. */
export function isCampaignSettled(status: AgentCampaignStatus): boolean {
  return status === 'DONE' || status === 'FAILED' || status === 'CANCELLED';
}

function rollUpStatus(steps: readonly AgentStep[], running: boolean): AgentCampaignStatus {
  if (steps.some((s) => s.status === 'FAILED')) return 'FAILED';
  if (steps.every((s) => STEP_TERMINAL.has(s.status))) return 'DONE';
  return running ? 'RUNNING' : 'BLOCKED';
}

/**
 * The pure campaign state machine: given a campaign and one event, return the next campaign. It never mutates its
 * input, refuses to move a settled campaign, and keeps the campaign status a faithful roll-up of its steps (any failed
 * step fails the campaign; all steps terminal completes it). A `CANCEL` stops everything still pending.
 */
export function advanceCampaign(campaign: AgentCampaign, event: AgentCampaignEvent): AgentCampaign {
  if (isCampaignSettled(campaign.status)) return campaign;

  if (event.type === 'START') {
    return campaign.status === 'PLANNING' ? { ...campaign, status: 'RUNNING' } : campaign;
  }
  if (event.type === 'CANCEL') {
    const steps = campaign.steps.map((s) =>
      STEP_TERMINAL.has(s.status) ? s : { ...s, status: 'SKIPPED' as const },
    );
    return { ...campaign, status: 'CANCELLED', steps };
  }

  const setStep = (patch: (s: AgentStep) => AgentStep): AgentCampaign => {
    let touched = false;
    const steps = campaign.steps.map((s) => {
      if (s.id !== event.stepId) return s;
      touched = true;
      return patch(s);
    });
    if (!touched) return campaign; // unknown step id: a no-op, never an invented step
    return { ...campaign, steps, status: rollUpStatus(steps, true) };
  };

  switch (event.type) {
    case 'STEP_STARTED':
      return setStep((s) => (s.status === 'PENDING' ? { ...s, status: 'RUNNING' } : s));
    case 'STEP_SUCCEEDED':
      return setStep((s) => ({ ...s, status: 'DONE', result: event.result }));
    case 'STEP_FAILED':
      return setStep((s) => ({ ...s, status: 'FAILED', result: event.result }));
    case 'STEP_SKIPPED':
      return setStep((s) => (STEP_TERMINAL.has(s.status) ? s : { ...s, status: 'SKIPPED' }));
  }
}

// Capability 1 (operational): the tool catalogue and the pure agent turn. Re-exported at the end so the runtime values
// these modules import from here (the tool-call and generative-UI schemas) are defined before the re-export loads them.
export * from './tools.js';
export * from './loop.js';
export * from './marketing.js';
export * from './builder.js';
