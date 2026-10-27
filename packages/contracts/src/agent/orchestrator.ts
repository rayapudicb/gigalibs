import {
  type AgentCampaign,
  type AgentMessage,
  type AgentStep,
  type AgentToolCall,
  type AgentToolResult,
  type AgentToolSpec,
  type GenerativeUINode,
  advanceCampaign,
  buildSystemPrompt,
  parseAgentDecision,
  validateGenerativeUI,
} from './index.js';

// WI-OI-120bc (Giga AI Companion): the agent loop. It is written against INJECTED interfaces — a ModelClient (which
// actually calls Claude) and a ToolExecutor (which actually runs a tool) — so the loop itself is deterministic and
// unit-testable with fakes, no API key or running stack required. The real adapters are thin and wired by the runtime.
// The loop enforces the security boundary: a tool the caller was not offered is refused, never executed.

/** The model, abstracted: given the system prompt and transcript, return one raw decision (shape validated here). */
export interface ModelClient {
  decide(system: string, messages: readonly AgentMessage[]): Promise<unknown>;
}

/** Runs one tool call and returns its result. Implemented by the runtime against the modules. */
export interface ToolExecutor {
  execute(call: AgentToolCall): Promise<AgentToolResult>;
}

export interface RunCompanionOptions {
  readonly goal: string;
  /** The tools the caller may use — already the least-privilege set (see toolsForPermissions). */
  readonly tools: readonly AgentToolSpec[];
  readonly model: ModelClient;
  readonly executor: ToolExecutor;
  readonly createdBy: string;
  /** A hard cap on model turns so a loop can never run away. */
  readonly maxTurns?: number;
}

export type CompanionOutcome = 'done' | 'needs_input' | 'failed' | 'max_turns';

export interface CompanionRun {
  readonly outcome: CompanionOutcome;
  readonly campaign: AgentCampaign;
  /** The generative-UI panels the agent chose to show, in order. */
  readonly panels: readonly GenerativeUINode[];
  readonly transcript: readonly AgentMessage[];
  /** Present when the outcome is `needs_input`: the question to put to the user. */
  readonly question?: string;
}

const DEFAULT_MAX_TURNS = 12;

/**
 * Run the Companion toward a goal. Each turn: ask the model, validate its decision, and act —
 * `plan` seeds the campaign, `tool_calls` run (only offered tools; results advance the campaign in order and feed the
 * next turn), `show` collects a validated panel (and may finish), `ask` stops for the user, `done` finishes. Invalid
 * model output and refused tools are fed back as messages so the model can correct, never crashing the loop.
 */
export async function runCompanion(opts: RunCompanionOptions): Promise<CompanionRun> {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const system = buildSystemPrompt(opts.goal, opts.tools);
  const offered = new Set(opts.tools.map((t) => t.name));

  const transcript: AgentMessage[] = [{ role: 'user', content: opts.goal }];
  const panels: GenerativeUINode[] = [];
  let campaign: AgentCampaign = {
    id: `camp-${opts.createdBy}`,
    goal: opts.goal,
    status: 'PLANNING',
    steps: [],
    createdBy: opts.createdBy,
  };
  const say = (role: AgentMessage['role'], content: string) => transcript.push({ role, content });
  const advanceNextStep = (result: AgentToolResult) => {
    const next = campaign.steps.find((s) => s.status === 'PENDING' || s.status === 'RUNNING');
    if (!next) return;
    campaign = advanceCampaign(campaign, {
      type: result.ok ? 'STEP_SUCCEEDED' : 'STEP_FAILED',
      stepId: next.id,
      result,
    });
  };

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const parsed = parseAgentDecision(await opts.model.decide(system, transcript));
    if (!parsed.ok) {
      say('user', `Your last message was not a valid decision (${parsed.reason}). Try again.`);
      continue;
    }
    const decision = parsed.decision;

    if (decision.kind === 'done') {
      say('assistant', decision.summary);
      return { outcome: 'done', campaign, panels, transcript };
    }
    if (decision.kind === 'ask') {
      say('assistant', decision.question);
      return { outcome: 'needs_input', campaign, panels, transcript, question: decision.question };
    }
    if (decision.kind === 'plan') {
      const steps: AgentStep[] = decision.steps.map((s, i) => ({
        id: `s${i + 1}`,
        title: s.title,
        status: 'PENDING',
      }));
      campaign = advanceCampaign({ ...campaign, steps }, { type: 'START' });
      say('assistant', `Plan: ${steps.map((s) => s.title).join('; ')}`);
      continue;
    }
    if (decision.kind === 'show') {
      const check = validateGenerativeUI(decision.ui);
      if (!check.ok) {
        say('user', `That panel was rejected (${check.reason}). Send a valid one.`);
        continue;
      }
      panels.push(decision.ui);
      say('assistant', '[showed a panel]');
      if (decision.done) return { outcome: 'done', campaign, panels, transcript };
      continue;
    }
    // decision.kind === 'tool_calls'
    for (const call of decision.calls) {
      if (!offered.has(call.tool)) {
        // Security boundary: never run a tool the caller was not offered.
        say('user', `Tool "${call.tool}" is not available to you; it was not run.`);
        continue;
      }
      const result = await opts.executor.execute(call);
      advanceNextStep(result);
      say('tool', `${call.tool}: ${result.ok ? 'ok' : 'failed'} — ${result.summary}`);
    }
  }

  return { outcome: 'max_turns', campaign, panels, transcript };
}
