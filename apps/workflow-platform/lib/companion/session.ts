import {
  type AgentToolSpec,
  BUILDER_TOOLS,
  type CompanionRun,
  MARKETING_TOOLS,
  type ModelClient,
  OPERATIONAL_TOOLS,
  type ToolExecutor,
  runCompanion,
  toolsForPermissions,
} from '@gigalibs/contracts';

// WI-OI-120bc (Giga AI Companion): the session glue. It unifies all three capabilities' tool catalogues, scopes them
// to the caller's permissions (the least-privilege boundary), and runs the loop. `heldPermissions` is passed in — the
// route reads it from the session — so this stays pure and testable with fakes, independent of auth plumbing.

/** Every tool the Companion can offer, across operational (cap 1), marketing (cap 2) and builder (cap 3). */
export const ALL_COMPANION_TOOLS: readonly AgentToolSpec[] = [
  ...OPERATIONAL_TOOLS,
  ...MARKETING_TOOLS,
  ...BUILDER_TOOLS,
];

export interface CompanionSessionInput {
  readonly goal: string;
  /** The permission codes the signed-in caller holds; decides which tools are offered. */
  readonly heldPermissions: readonly string[];
  readonly model: ModelClient;
  readonly executor: ToolExecutor;
  readonly createdBy: string;
  readonly maxTurns?: number;
}

/** Run one Companion session: offer only the tools the caller may use, then drive the loop to an outcome. */
export function runCompanionSession(input: CompanionSessionInput): Promise<CompanionRun> {
  const tools = toolsForPermissions(ALL_COMPANION_TOOLS, input.heldPermissions);
  return runCompanion({
    goal: input.goal,
    tools,
    model: input.model,
    executor: input.executor,
    createdBy: input.createdBy,
    maxTurns: input.maxTurns,
  });
}
