import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as live } from '../app/api/health/live/route';
import { GET as ready } from '../app/api/health/ready/route';

const upstreamFetch = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', upstreamFetch);
  vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('workflow-platform health contract', () => {
  it('reports process liveness without claiming dependency readiness', async () => {
    const response = live();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'gigalibs-workflow-platform',
    });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('reports ready only for the exact control-plane readiness response', async () => {
    upstreamFetch.mockResolvedValue(
      Response.json({ status: 'ready', database: 'connected' }),
    );

    const response = await ready();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready', controlPlane: 'ready' });
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/ready',
    );
  });

  it.each([
    Response.json({ status: 'ok' }),
    Response.json({ status: 'not-ready', database: 'unavailable' }, { status: 503 }),
    new Response('{invalid'),
  ])('fails closed for a non-ready control-plane response', async (upstreamResponse) => {
    upstreamFetch.mockResolvedValue(upstreamResponse);

    const response = await ready();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'not-ready',
      controlPlane: 'unavailable',
    });
  });

  it('fails closed without leaking upstream errors', async () => {
    upstreamFetch.mockRejectedValue(new Error('sensitive-upstream-detail'));

    const response = await ready();

    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive-upstream-detail');
  });
});
