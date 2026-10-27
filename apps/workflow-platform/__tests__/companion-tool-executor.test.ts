import type { AgentToolCall } from '@gigalibs/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  type CompanionHttpCaller,
  type CompanionModuleCaller,
  createCompanionToolExecutor,
} from '../lib/companion/tool-executor';

// WI-OI-120bc (Giga AI Companion): the ToolExecutor routes a tool call to its backend request (stubbed caller), and
// fails honestly for unbound tools or backend errors.

const call = (tool: string, args: Record<string, unknown> = {}): AgentToolCall => ({
  id: 'c1',
  tool,
  arguments: args,
});

describe('createCompanionToolExecutor', () => {
  it('routes a bound tool to its control-plane request and summarizes the result', async () => {
    const caller = vi.fn<CompanionHttpCaller>(async () => ({
      ok: true,
      status: 200,
      data: { base: 'USD', rates: [{ quoteCurrency: 'EUR', rate: 0.92 }] },
    }));
    const result = await createCompanionToolExecutor(caller).execute(
      call('currency.rates.table', { base: 'USD' }),
    );

    expect(caller).toHaveBeenCalledWith('GET', '/currency/exchange-rates/table', {
      query: { base: 'USD' },
      body: undefined,
    });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('base USD');
    expect(result.summary).toContain('1 rate');
    expect(result.data).toEqual({ base: 'USD', rates: [{ quoteCurrency: 'EUR', rate: 0.92 }] });
  });

  it('maps the usage statement tool with its query', async () => {
    const caller = vi.fn<CompanionHttpCaller>(async () => ({
      ok: true,
      status: 200,
      data: { periodKey: '2026-10', plan: 'STARTER', totalAmountMinor: 500 },
    }));
    const result = await createCompanionToolExecutor(caller).execute(
      call('billing.usage.statement', { plan: 'STARTER', period: '2026-10' }),
    );
    expect(caller).toHaveBeenCalledWith('GET', '/usage/statement', {
      query: { plan: 'STARTER', period: '2026-10' },
      body: undefined,
    });
    expect(result.summary).toContain('2026-10');
    expect(result.summary).toContain('500 minor');
  });

  it('routes a CMMS create to the signed module caller with the work-order body', async () => {
    const control = vi.fn<CompanionHttpCaller>(async () => ({ ok: true, status: 200, data: {} }));
    const moduleCaller = vi.fn<CompanionModuleCaller>(async () => ({
      ok: true,
      status: 201,
      data: { id: 'wo-1', number: 'WO-000123' },
    }));
    const result = await createCompanionToolExecutor(control, moduleCaller).execute(
      call('cmms.workOrders.create', { title: 'Fix pump', assetId: 'a-1', priority: 'HIGH' }),
    );
    expect(control).not.toHaveBeenCalled();
    expect(moduleCaller).toHaveBeenCalledWith(
      'physical-operations-cmms',
      'POST',
      ['v1', 'work-orders'],
      {
        title: 'Fix pump',
        assetId: 'a-1',
        priority: 'HIGH',
        description: undefined,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('WO-000123');
  });

  it('fails honestly when a module tool is called but no module caller is configured', async () => {
    const control = vi.fn<CompanionHttpCaller>(async () => ({ ok: true, status: 200, data: {} }));
    const result = await createCompanionToolExecutor(control).execute(
      call('cmms.workOrders.create', { title: 'x' }),
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('module gateway');
  });

  it('fails honestly for an unbound tool — no fabricated call', async () => {
    const caller = vi.fn<CompanionHttpCaller>(async () => ({ ok: true, status: 200, data: {} }));
    const result = await createCompanionToolExecutor(caller).execute(
      call('cmms.workOrders.assign'),
    );
    expect(caller).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('not wired to a backend yet');
  });

  it('reports a backend error and a thrown caller as a failed result, never throwing', async () => {
    const failing = vi.fn<CompanionHttpCaller>(async () => ({
      ok: false,
      status: 403,
      data: null,
    }));
    const denied = await createCompanionToolExecutor(failing).execute(
      call('currency.rates.table', { base: 'USD' }),
    );
    expect(denied.ok).toBe(false);
    expect(denied.summary).toContain('HTTP 403');

    const throwing = vi.fn<CompanionHttpCaller>(async () => {
      throw new Error('ECONNREFUSED');
    });
    const errored = await createCompanionToolExecutor(throwing).execute(
      call('currency.rates.table', { base: 'USD' }),
    );
    expect(errored.ok).toBe(false);
    expect(errored.summary).toContain('ECONNREFUSED');
  });
});
