/**
 * WI-OI-085e — the shared module host is ready only when every hosted module reports ready on its own route.
 */
import { describe, expect, it, vi } from 'vitest';
import { hostedModules } from './hosted-modules.generated.js';
import { hostReadiness } from './readiness.js';

const modules = [
  { name: 'field-inspections', path: 'field-inspections' },
  { name: 'site-visits', path: 'site-visits' },
];

describe('module host readiness', () => {
  it('is ready when every hosted module is ready', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await expect(hostReadiness(modules, 4790, fetchImpl as typeof fetch)).resolves.toMatchObject({ ready: true });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4790/site-visits/v1/health/ready', expect.anything());
  });

  it('is not ready when one module is not ready or does not answer', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('site-visits')) throw new Error('refused');
      return new Response('{}', { status: 503 });
    });
    const state = await hostReadiness(modules, 4790, fetchImpl as typeof fetch);
    expect(state.ready).toBe(false);
    expect(state.modules).toEqual([
      { module: 'field-inspections', ready: false },
      { module: 'site-visits', ready: false },
    ]);
  });

  it('lists hosted modules from the generated file', () => {
    expect(Array.isArray(hostedModules)).toBe(true);
  });
});
