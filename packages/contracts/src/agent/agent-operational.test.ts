import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_TOOLS,
  buildSystemPrompt,
  findTool,
  parseAgentDecision,
  toolsForPermissions,
} from './index.js';

// WI-OI-120bc (Giga AI Companion, capability 1): the tool catalogue's least-privilege filter and the pure agent turn.

describe('toolsForPermissions (least privilege)', () => {
  const names = (held: readonly string[] | null | undefined) =>
    toolsForPermissions(OPERATIONAL_TOOLS, held)
      .map((t) => t.name)
      .sort();

  it('offers only the tools whose permission the caller holds', () => {
    expect(names(['cmms.work-orders.read', 'people:read'])).toEqual([
      'cmms.workOrders.search',
      'workforce.people.availableAt',
      'workforce.people.search',
    ]);
  });

  it('withholds a write tool from a read-only caller', () => {
    expect(names(['cmms.work-orders.read'])).toEqual(['cmms.workOrders.search']);
    expect(names(['cmms.work-orders.read'])).not.toContain('cmms.workOrders.assign');
  });

  it('honours a family wildcard', () => {
    expect(names(['cmms:*'])).toEqual([
      'cmms.meters.read',
      'cmms.workOrders.assign',
      'cmms.workOrders.create',
      'cmms.workOrders.search',
    ]);
  });

  it('offers nothing to a caller with no permissions', () => {
    expect(names([])).toEqual([]);
    expect(names(null)).toEqual([]);
  });

  it('finds a tool by name, or undefined', () => {
    expect(findTool(OPERATIONAL_TOOLS, 'currency.rates.table')?.requiresPermission).toBe(
      'currency:read',
    );
    expect(findTool(OPERATIONAL_TOOLS, 'nope')).toBeUndefined();
  });
});

describe('parseAgentDecision', () => {
  it('accepts each valid decision kind', () => {
    expect(parseAgentDecision({ kind: 'plan', steps: [{ title: 'Find overdue WOs' }] }).ok).toBe(
      true,
    );
    expect(
      parseAgentDecision({ kind: 'tool_calls', calls: [{ id: 'c1', tool: 'x', arguments: {} }] })
        .ok,
    ).toBe(true);
    expect(
      parseAgentDecision({ kind: 'show', ui: { kind: 'text', text: 'hi' }, done: true }).ok,
    ).toBe(true);
    expect(parseAgentDecision({ kind: 'ask', question: 'Which site?' }).ok).toBe(true);
    expect(parseAgentDecision({ kind: 'done', summary: 'All set.' }).ok).toBe(true);
  });

  it('rejects an unknown kind and a show with an invalid UI node', () => {
    expect(parseAgentDecision({ kind: 'exec', shell: 'rm -rf /' }).ok).toBe(false);
    expect(parseAgentDecision({ kind: 'show', ui: { kind: 'html', value: '<b>x</b>' } }).ok).toBe(
      false,
    );
  });
});

describe('buildSystemPrompt', () => {
  it('names the goal, the offered tools and the safety rules', () => {
    const tools = toolsForPermissions(OPERATIONAL_TOOLS, ['people:read']);
    const prompt = buildSystemPrompt('Staff Site A tomorrow', tools);
    expect(prompt).toContain('Giga AI Companion');
    expect(prompt).toContain('Staff Site A tomorrow');
    expect(prompt).toContain('workforce.people.availableAt');
    expect(prompt).toContain('Never invent data');
  });

  it('says plainly when the user has no tools', () => {
    expect(buildSystemPrompt('x', [])).toContain('no tools are available');
  });
});
