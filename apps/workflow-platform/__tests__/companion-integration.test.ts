import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompanionModelClient } from '../lib/companion/model-client';
import { runCompanionSession } from '../lib/companion/session';
import {
  type CompanionHttpCaller,
  createCompanionToolExecutor,
} from '../lib/companion/tool-executor';

// WI-OI-120bc (Giga AI Companion): the ASSEMBLED pipeline — the real local-Ollama ModelClient + the real ToolExecutor
// + the session loop, with only the two external boundaries stubbed (the Ollama HTTP call and the control-plane
// caller). This proves the real adapters compose: Ollama's response shape parses into decisions the loop accepts, the
// executor routes + summarizes, and results feed back into the next turn. No live model, no stack, no key.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Make the stubbed Ollama return a scripted sequence of decisions, one per turn (its /api/generate shape). */
function stubOllama(decisions: readonly unknown[]): void {
  const queue = decisions.map((d) => ({ response: JSON.stringify(d) }));
  vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11434');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(queue.shift() ?? { response: '{}' }), { status: 200 }),
    ),
  );
}

describe('Companion pipeline (real adapters, stubbed boundaries)', () => {
  it('drives goal → plan → tool → show(done) through the real ModelClient + ToolExecutor', async () => {
    stubOllama([
      { kind: 'plan', steps: [{ title: 'Look up USD rates' }] },
      {
        kind: 'tool_calls',
        calls: [{ id: 'c1', tool: 'currency.rates.table', arguments: { base: 'USD' } }],
      },
      { kind: 'show', ui: { kind: 'text', text: 'USD base: 2 rates on file.' }, done: true },
    ]);
    const caller = vi.fn<CompanionHttpCaller>(async () => ({
      ok: true,
      status: 200,
      data: {
        base: 'USD',
        rates: [
          { quoteCurrency: 'EUR', rate: 0.92 },
          { quoteCurrency: 'JPY', rate: 154 },
        ],
      },
    }));

    const run = await runCompanionSession({
      goal: 'Show the exchange-rate table for USD',
      heldPermissions: ['currency:read'],
      createdBy: 'user-1',
      model: createCompanionModelClient(),
      executor: createCompanionToolExecutor(caller),
    });

    expect(run.outcome).toBe('done');
    expect(caller).toHaveBeenCalledWith('GET', '/currency/exchange-rates/table', {
      query: { base: 'USD' },
      body: undefined,
    });
    expect(run.panels).toHaveLength(1);
    expect(run.campaign.steps[0]?.status).toBe('DONE');
    expect(run.transcript.some((m) => m.role === 'tool' && m.content.includes('2 rate'))).toBe(
      true,
    );
  });

  it('recovers when the local model first returns non-JSON, then finishes', async () => {
    // First turn: Ollama returns a non-JSON body → the helper yields { raw } → parseAgentDecision rejects → retry.
    vi.stubEnv('OLLAMA_HOST', 'http://127.0.0.1:11434');
    const bodies = [
      { response: 'sorry, thinking...' }, // not a valid decision
      { response: JSON.stringify({ kind: 'done', summary: 'All set.' }) },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(bodies.shift() ?? { response: '{}' }), { status: 200 }),
      ),
    );

    const run = await runCompanionSession({
      goal: 'anything',
      heldPermissions: [],
      createdBy: 'u',
      model: createCompanionModelClient(),
      executor: createCompanionToolExecutor(vi.fn<CompanionHttpCaller>()),
    });
    expect(run.outcome).toBe('done');
    expect(run.transcript.some((m) => m.content.includes('not a valid decision'))).toBe(true);
  });
});
