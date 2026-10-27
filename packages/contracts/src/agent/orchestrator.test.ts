import { describe, expect, it } from 'vitest';
import {
  type AgentToolCall,
  type AgentToolResult,
  type ModelClient,
  OPERATIONAL_TOOLS,
  type ToolExecutor,
  runCompanion,
  toolsForPermissions,
} from '../index.js';

// WI-OI-120bc (Giga AI Companion): the agent loop, driven by a scripted model + a fake executor — a full cycle with no
// API key or stack. Also proves the barrel wires the orchestrator with no module cycle.

const scriptedModel = (script: readonly unknown[]): ModelClient => {
  const queue = [...script];
  return { decide: async () => queue.shift() };
};

const spyExecutor = () => {
  const calls: AgentToolCall[] = [];
  const executor: ToolExecutor = {
    async execute(call): Promise<AgentToolResult> {
      calls.push(call);
      return { callId: call.id, ok: true, summary: `ran ${call.tool}` };
    },
  };
  return { executor, calls };
};

const readTools = toolsForPermissions(OPERATIONAL_TOOLS, ['people:read']); // search + availableAt

describe('runCompanion', () => {
  it('runs a full goal → plan → tool → show(done) cycle', async () => {
    const { executor, calls } = spyExecutor();
    const run = await runCompanion({
      goal: 'Who can work at Site A tomorrow?',
      tools: readTools,
      createdBy: 'user-1',
      model: scriptedModel([
        { kind: 'plan', steps: [{ title: 'Look up availability' }] },
        {
          kind: 'tool_calls',
          calls: [
            {
              id: 'c1',
              tool: 'workforce.people.availableAt',
              arguments: { placeId: 'A', date: '2026-10-28' },
            },
          ],
        },
        { kind: 'show', ui: { kind: 'text', text: 'Two people are available.' }, done: true },
      ]),
      executor,
    });
    expect(run.outcome).toBe('done');
    expect(calls.map((c) => c.tool)).toEqual(['workforce.people.availableAt']);
    expect(run.campaign.steps[0]?.status).toBe('DONE');
    expect(run.panels).toHaveLength(1);
  });

  it('refuses a tool the caller was not offered (never executes it)', async () => {
    const { executor, calls } = spyExecutor();
    const run = await runCompanion({
      goal: 'Assign a tech',
      tools: readTools, // no write tool offered
      createdBy: 'user-1',
      model: scriptedModel([
        {
          kind: 'tool_calls',
          calls: [{ id: 'c1', tool: 'cmms.workOrders.assign', arguments: {} }],
        },
        { kind: 'done', summary: 'Could not — not allowed.' },
      ]),
      executor,
    });
    expect(calls).toHaveLength(0); // the un-offered tool was never run
    expect(run.outcome).toBe('done');
    expect(run.transcript.some((m) => m.content.includes('not available to you'))).toBe(true);
  });

  it('recovers from an invalid decision instead of crashing', async () => {
    const { executor } = spyExecutor();
    const run = await runCompanion({
      goal: 'x',
      tools: readTools,
      createdBy: 'u',
      model: scriptedModel([{ kind: 'nonsense' }, { kind: 'done', summary: 'ok' }]),
      executor,
    });
    expect(run.outcome).toBe('done');
    expect(run.transcript.some((m) => m.content.includes('not a valid decision'))).toBe(true);
  });

  it('stops for the user on an ask', async () => {
    const { executor } = spyExecutor();
    const run = await runCompanion({
      goal: 'x',
      tools: readTools,
      createdBy: 'u',
      model: scriptedModel([{ kind: 'ask', question: 'Which site?' }]),
      executor,
    });
    expect(run.outcome).toBe('needs_input');
    expect(run.question).toBe('Which site?');
  });

  it('caps runaway loops at maxTurns', async () => {
    const { executor } = spyExecutor();
    const run = await runCompanion({
      goal: 'x',
      tools: readTools,
      createdBy: 'u',
      maxTurns: 3,
      // never returns done: a panel every turn
      model: scriptedModel(
        Array.from({ length: 10 }, () => ({ kind: 'show', ui: { kind: 'text', text: 'more' } })),
      ),
      executor,
    });
    expect(run.outcome).toBe('max_turns');
    expect(run.panels).toHaveLength(3);
  });
});
