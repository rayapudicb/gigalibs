import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, GET, POST } from '../app/mobile/v1/[...path]/route';

// WI-OI-120cf: the `/mobile/v1` front door forwards only its listed routes, with the bearer and the app's headers and
// nothing else (no cookie, no tenant header, no query), answers `no-store`, and turns anything that is not a mobile
// problem into one.

const upstreamFetch = vi.fn<typeof fetch>();
const INSTALLATION = '0199d6f4-3af2-7b4e-8eb2-4e58b2be4a01';

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function mobileRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://platform.example.invalid/mobile/v1/${path}`, init);
}

describe('mobile v1 BFF front door', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', upstreamFetch);
    vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '1048576');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('forwards a sign-in to the control plane with only the mobile headers', async () => {
    upstreamFetch.mockResolvedValue(
      new Response(JSON.stringify({ contractVersion: 'mobile-mfa-challenge.v1' }), { status: 200, headers: { 'Set-Cookie': 'x=y' } }),
    );
    const body = JSON.stringify({ contractVersion: 'mobile-password-sign-in.v1' });
    const response = await POST(
      mobileRequest('auth/password?tenantId=t-2', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'gigalibs_access_token=web',
          'x-tenant-id': 'tenant-2',
          'x-gigalibs-installation-id': INSTALLATION,
          'x-gigalibs-app-profile': 'gigalibs-universal',
          'x-correlation-id': 'corr-12345678',
        },
      }),
      context(['auth', 'password']),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    const [url, init] = upstreamFetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://control.example.invalid/api/v1/mobile/auth/password');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-gigalibs-installation-id')).toBe(INSTALLATION);
    expect(headers.get('x-correlation-id')).toBe('corr-12345678');
    expect(headers.has('cookie')).toBe(false);
    expect(headers.has('x-tenant-id')).toBe(false);
    expect(init?.body).toBe(body);
  });

  it('forwards the session read with its bearer', async () => {
    upstreamFetch.mockResolvedValue(new Response('{"contractVersion":"mobile-session.v3"}', { status: 200 }));
    await GET(
      mobileRequest('session', { headers: { Authorization: 'Bearer mobile-token', 'x-gigalibs-installation-id': INSTALLATION } }),
      context(['session']),
    );
    const [url, init] = upstreamFetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://control.example.invalid/api/v1/mobile/session');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer mobile-token');
    expect(init?.method).toBe('GET');
  });

  it('admits only a UUID-bound Rounds offline grant read',async () => {
    const assignment='10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockResolvedValueOnce(new Response('{"contractVersion":"round-offline-grant.v1"}',
      {status:200}));
    const response=await GET(mobileRequest(`rounds/assignments/${assignment}/offline-grant`,
      {headers:{Authorization:'Bearer mobile-token','x-gigalibs-installation-id':INSTALLATION}}),
      context(['rounds','assignments',assignment,'offline-grant']));
    expect(response.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0]?.[0])).toBe(
      `https://control.example.invalid/api/v1/mobile/rounds/assignments/${assignment}/offline-grant`);
    const malformed=await GET(mobileRequest('rounds/assignments/not-a-uuid/offline-grant'),
      context(['rounds','assignments','not-a-uuid','offline-grant']));
    expect(malformed.status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('forwards only a UUID-bound Rounds inspection history read',async () => {
    const assignment='10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockResolvedValueOnce(new Response('{"contractVersion":"round-checkpoint-history.v1"}',
      {status:200}));
    const response=await GET(mobileRequest(`rounds/assignments/${assignment}/history`,
      {headers:{Authorization:'Bearer mobile-token','x-gigalibs-installation-id':INSTALLATION}}),
      context(['rounds','assignments',assignment,'history']));
    expect(response.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0]?.[0])).toBe(
      `https://control.example.invalid/api/v1/mobile/rounds/assignments/${assignment}/history`);
    expect((await GET(mobileRequest('rounds/assignments/nope/history'),
      context(['rounds','assignments','nope','history']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
  });

  it('forwards only the listed Rounds supervisor board read', async () => {
    upstreamFetch.mockResolvedValueOnce(new Response('{"items":[]}', {status:200}));
    const response=await GET(mobileRequest('rounds/board'),context(['rounds','board']));
    expect(response.status).toBe(200);
    expect(String(upstreamFetch.mock.calls[0]?.[0])).toBe(
      'https://control.example.invalid/api/v1/mobile/rounds/board');
  });

  it('answers an unlisted route or method as not found, without calling the control plane', async () => {
    for (const [handler, path, method] of [
      [GET, ['auth', 'password'], 'GET'],
      [POST, ['cmms', 'work-orders'], 'POST'],
      [GET, ['..', 'api', 'v1', 'auth', 'context'], 'GET'],
      [DELETE, ['session'], 'DELETE'],
    ] as const) {
      const response = await handler(mobileRequest(path.join('/'), { method }), context([...path]));
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('application/problem+json');
      expect(await response.json()).toMatchObject({ code: 'MOBILE_NOT_FOUND', status: 404 });
    }
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('passes a mobile problem through as problem JSON, and nothing else of an upstream error', async () => {
    upstreamFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'about:blank', title: 'Sign in again.', status: 401, code: 'MOBILE_AUTH_REQUIRED' }), { status: 401 }),
    );
    const refused = await GET(mobileRequest('memberships'), context(['memberships']));
    expect(refused.status).toBe(401);
    expect(refused.headers.get('Content-Type')).toBe('application/problem+json');
    expect(await refused.json()).toEqual({ type: 'about:blank', title: 'Sign in again.', status: 401, code: 'MOBILE_AUTH_REQUIRED' });

    upstreamFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ statusCode: 500, message: 'relation "sessions" does not exist' }), { status: 500 }),
    );
    const failed = await GET(mobileRequest('memberships'), context(['memberships']));
    expect(failed.status).toBe(503);
    const text = await failed.text();
    expect(text).not.toContain('relation');
    expect(JSON.parse(text)).toMatchObject({ code: 'MOBILE_UNAVAILABLE' });

    upstreamFetch.mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 404, message: 'Cannot GET' }), { status: 404 }));
    expect(await (await GET(mobileRequest('memberships'), context(['memberships']))).json()).toMatchObject({ code: 'MOBILE_NOT_FOUND' });
  });

  it('answers a logout with no content, and a slow or unreachable control plane as a mobile problem', async () => {
    upstreamFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const loggedOut = await POST(mobileRequest('auth/logout', { method: 'POST', body: '{}' }), context(['auth', 'logout']));
    expect(loggedOut.status).toBe(204);

    upstreamFetch.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const slow = await GET(mobileRequest('session'), context(['session']));
    expect(slow.status).toBe(504);
    expect(await slow.json()).toMatchObject({ code: 'MOBILE_UPSTREAM_TIMEOUT' });

    upstreamFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await GET(mobileRequest('session'), context(['session']))).status).toBe(503);
  });

  it('refuses a body over the limit before forwarding', async () => {
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '16');
    const response = await POST(
      mobileRequest('auth/refresh', { method: 'POST', body: 'x'.repeat(64), headers: { 'Content-Length': '64' } }),
      context(['auth', 'refresh']),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'MOBILE_REQUEST_INVALID' });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
