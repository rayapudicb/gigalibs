import type {
  AgentToolCall,
  AgentToolResult,
  ModelClient,
  ToolExecutor,
} from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { ALL_COMPANION_TOOLS, runCompanionSession } from '../lib/companion/session';

// WI-OI-120bc (Giga AI Companion): the session composes the unified tool catalogue + least-privilege + the loop.

const scriptedModel = (script: readonly unknown[]): ModelClient => {
  const queue = [...script];
  return { decide: async () => queue.shift() };
};
const recordingExecutor = () => {
  const calls: AgentToolCall[] = [];
  const executor: ToolExecutor = {
    async execute(call): Promise<AgentToolResult> {
      calls.push(call);
      return { callId: call.id, ok: true, summary: `ran ${call.tool}` };
    },
  };
  return { executor, calls };
};

describe('runCompanionSession', () => {
  it('unifies all three capabilities in the catalogue', () => {
    const names = ALL_COMPANION_TOOLS.map((t) => t.name);
    expect(names).toContain('cmms.workOrders.search'); // operational
    expect(names).toContain('marketing.campaign.send'); // marketing
    expect(names).toContain('builder.view.save'); // builder
  });

  it('offers only the caller’s permitted tools and runs the loop to done', async () => {
    const { executor, calls } = recordingExecutor();
    const run = await runCompanionSession({
      goal: 'Who can work at Site A tomorrow?',
      heldPermissions: ['people:read'],
      createdBy: 'user-1',
      model: scriptedModel([
        { kind: 'plan', steps: [{ title: 'Check availability' }] },
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
        { kind: 'done', summary: 'Two are available.' },
      ]),
      executor,
    });
    expect(run.outcome).toBe('done');
    expect(calls.map((c) => c.tool)).toEqual(['workforce.people.availableAt']);
  });

  it('refuses a tool the caller’s permissions do not cover', async () => {
    const { executor, calls } = recordingExecutor();
    const run = await runCompanionSession({
      goal: 'Send the campaign',
      heldPermissions: ['people:read'], // no marketing:send
      createdBy: 'user-1',
      model: scriptedModel([
        {
          kind: 'tool_calls',
          calls: [{ id: 'c1', tool: 'marketing.campaign.send', arguments: { campaignId: 'm1' } }],
        },
        { kind: 'done', summary: 'Not allowed.' },
      ]),
      executor,
    });
    expect(calls).toHaveLength(0); // never offered, never run
    expect(run.outcome).toBe('done');
  });
});
