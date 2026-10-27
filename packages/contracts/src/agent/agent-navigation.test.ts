import { describe, expect, it } from 'vitest';
import {
  type ModelClient,
  NAVIGABLE_SCREENS,
  type ToolExecutor,
  findScreen,
  runCompanion,
  screensForPermissions,
} from '../index.js';

// WI-OI-120bc (Giga AI Companion): the navigate capability — least-privilege screen catalogue + the loop opening a
// real screen (and refusing one that was not offered, so it can never send the user to an invented path).

const scriptedModel = (script: readonly unknown[]): ModelClient => {
  const queue = [...script];
  return { decide: async () => queue.shift() };
};
const noExecutor: ToolExecutor = {
  async execute(call) {
    return { callId: call.id, ok: false, summary: 'no tools in this test' };
  },
};

describe('screensForPermissions / findScreen', () => {
  const keys = (held: readonly string[]) =>
    screensForPermissions(NAVIGABLE_SCREENS, held).map((s) => s.key);

  it('offers only screens the caller can access', () => {
    expect(keys(['cmms.work-orders.read'])).toContain('cmms.work-orders');
    expect(keys(['cmms.work-orders.read'])).not.toContain('inventory');
    expect(keys([])).toEqual([]);
  });

  it('resolves a key to its real app path', () => {
    expect(findScreen(NAVIGABLE_SCREENS, 'cmms.work-orders')?.path).toBe('/cmms/work-orders');
    expect(findScreen(NAVIGABLE_SCREENS, 'nope')).toBeUndefined();
  });
});

describe('runCompanion navigate', () => {
  it('opens an offered screen — outcome navigate + the real path', async () => {
    const run = await runCompanion({
      goal: 'I want to create a work order',
      tools: [],
      screens: screensForPermissions(NAVIGABLE_SCREENS, ['cmms.work-orders.read']),
      model: scriptedModel([
        { kind: 'navigate', screen: 'cmms.work-orders', reason: 'Opening work orders' },
      ]),
      executor: noExecutor,
      createdBy: 'u',
    });
    expect(run.outcome).toBe('navigate');
    expect(run.navigateTo).toBe('/cmms/work-orders');
  });

  it('refuses a screen the caller was not offered (never an invented path)', async () => {
    const run = await runCompanion({
      goal: 'open inventory',
      tools: [],
      screens: screensForPermissions(NAVIGABLE_SCREENS, ['cmms.work-orders.read']), // inventory not offered
      model: scriptedModel([
        { kind: 'navigate', screen: 'inventory' },
        { kind: 'done', summary: 'Could not open that.' },
      ]),
      executor: noExecutor,
      createdBy: 'u',
    });
    expect(run.outcome).toBe('done');
    expect(run.navigateTo).toBeUndefined();
  });
});
