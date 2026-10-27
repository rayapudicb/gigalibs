import { describe, expect, it } from 'vitest';
import {
  type AgentCampaign,
  type AgentToolResult,
  DEFAULT_AGENT_MODEL,
  GENERATIVE_UI_MAX_DEPTH,
  advanceCampaign,
  validateGenerativeUI,
} from './index.js';

// WI-OI-120bc: the pure agent core — the safe generative-UI validator and the campaign state machine.

describe('validateGenerativeUI', () => {
  it('accepts an allow-listed tree', () => {
    expect(
      validateGenerativeUI({
        kind: 'group',
        heading: 'Summary',
        children: [
          { kind: 'heading', text: 'Open work orders', level: 2 },
          { kind: 'stat', label: 'Overdue', value: '3', delta: '+1' },
          { kind: 'table', columns: ['WO', 'Asset'], rows: [['WO-1', 'Pump A']] },
          { kind: 'actions', items: [{ label: 'Assign', actionId: 'assign', style: 'primary' }] },
        ],
      }).ok,
    ).toBe(true);
  });

  it('rejects an unknown component kind (no raw html/script escape hatch)', () => {
    expect(validateGenerativeUI({ kind: 'html', value: '<script>x</script>' }).ok).toBe(false);
    expect(validateGenerativeUI({ kind: 'iframe', src: 'https://evil' }).ok).toBe(false);
  });

  it('rejects unknown props on an otherwise-valid node (strict)', () => {
    expect(
      validateGenerativeUI({ kind: 'heading', text: 'x', level: 1, onClick: 'alert(1)' }).ok,
    ).toBe(false);
  });

  it('rejects nesting deeper than the bound', () => {
    let node: unknown = { kind: 'text', text: 'leaf' };
    for (let i = 0; i < GENERATIVE_UI_MAX_DEPTH + 1; i += 1)
      node = { kind: 'group', children: [node] };
    const r = validateGenerativeUI(node);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/nesting/);
  });

  it('rejects an action that smuggles a url instead of an actionId', () => {
    expect(
      validateGenerativeUI({
        kind: 'actions',
        items: [{ label: 'Go', actionId: 'ok', href: 'https://evil' }],
      }).ok,
    ).toBe(false);
  });
});

describe('advanceCampaign', () => {
  const base: AgentCampaign = {
    id: 'c1',
    goal: 'Close the overdue work orders in North',
    status: 'PLANNING',
    createdBy: 'user-1',
    steps: [
      { id: 's1', title: 'Find overdue WOs', status: 'PENDING' },
      { id: 's2', title: 'Assign a technician', status: 'PENDING' },
    ],
  };
  const ok = (callId: string): AgentToolResult => ({ callId, ok: true, summary: 'done' });
  const bad = (callId: string): AgentToolResult => ({ callId, ok: false, summary: 'failed' });

  it('starts only from PLANNING', () => {
    expect(advanceCampaign(base, { type: 'START' }).status).toBe('RUNNING');
    const running = advanceCampaign(base, { type: 'START' });
    expect(advanceCampaign(running, { type: 'START' }).status).toBe('RUNNING');
  });

  it('completes when every step is terminal', () => {
    let c = advanceCampaign(base, { type: 'START' });
    c = advanceCampaign(c, { type: 'STEP_SUCCEEDED', stepId: 's1', result: ok('1') });
    expect(c.status).toBe('RUNNING');
    c = advanceCampaign(c, { type: 'STEP_SUCCEEDED', stepId: 's2', result: ok('2') });
    expect(c.status).toBe('DONE');
    expect(c.steps.every((s) => s.status === 'DONE')).toBe(true);
  });

  it('fails the whole campaign when any step fails', () => {
    let c = advanceCampaign(base, { type: 'START' });
    c = advanceCampaign(c, { type: 'STEP_FAILED', stepId: 's1', result: bad('1') });
    expect(c.status).toBe('FAILED');
  });

  it('refuses to move a settled campaign and does not mutate its input', () => {
    const settled = { ...base, status: 'DONE' as const };
    expect(advanceCampaign(settled, { type: 'START' })).toBe(settled);
    const started = advanceCampaign(base, { type: 'START' });
    expect(base.status).toBe('PLANNING'); // input untouched
    expect(started).not.toBe(base);
  });

  it('cancels every still-pending step', () => {
    let c = advanceCampaign(base, { type: 'START' });
    c = advanceCampaign(c, { type: 'STEP_SUCCEEDED', stepId: 's1', result: ok('1') });
    c = advanceCampaign(c, { type: 'CANCEL' });
    expect(c.status).toBe('CANCELLED');
    expect(c.steps.find((s) => s.id === 's1')?.status).toBe('DONE'); // already-terminal kept
    expect(c.steps.find((s) => s.id === 's2')?.status).toBe('SKIPPED');
  });

  it('treats an unknown step id as a no-op, never inventing a step', () => {
    const running = advanceCampaign(base, { type: 'START' });
    const after = advanceCampaign(running, {
      type: 'STEP_SUCCEEDED',
      stepId: 'nope',
      result: ok('x'),
    });
    expect(after.steps).toHaveLength(2);
    expect(after.steps.every((s) => s.status === 'PENDING')).toBe(true);
  });

  it('defaults to the most capable model', () => {
    expect(DEFAULT_AGENT_MODEL).toBe('claude-opus-5-5');
  });
});
