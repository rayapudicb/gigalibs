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

  it('forwards the calibration routes, UUID-bound where an id is named (WI-OI-134)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    expect((await GET(mobileRequest('calibration/instruments', auth), context(['calibration', 'instruments']))).status).toBe(200);
    expect((await GET(mobileRequest(`calibration/instruments/${id}/bundle`, auth),
      context(['calibration', 'instruments', id, 'bundle']))).status).toBe(200);
    expect((await GET(mobileRequest(`calibration/records/${id}`, auth), context(['calibration', 'records', id]))).status).toBe(200);
    expect((await POST(mobileRequest('calibration/records', { ...auth, method: 'POST', body: '{}' }),
      context(['calibration', 'records']))).status).toBe(200);
    expect(upstreamFetch.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://control.example.invalid/api/v1/mobile/calibration/instruments',
      `https://control.example.invalid/api/v1/mobile/calibration/instruments/${id}/bundle`,
      `https://control.example.invalid/api/v1/mobile/calibration/records/${id}`,
      'https://control.example.invalid/api/v1/mobile/calibration/records',
    ]);
    expect((await GET(mobileRequest('calibration/instruments/nope/bundle'),
      context(['calibration', 'instruments', 'nope', 'bundle']))).status).toBe(404);
    expect((await POST(mobileRequest(`calibration/records/${id}`, { method: 'POST', body: '{}' }),
      context(['calibration', 'records', id]))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(4);
  });

  it('forwards the commissioning routes, UUID-bound where a walk is named (WI-OI-135)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    const post = (path: string) => POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')));
    expect((await GET(mobileRequest('commissioning/context', auth), context(['commissioning', 'context']))).status).toBe(200);
    for (const path of ['commissioning/requests', 'commissioning/tags/resolve', 'commissioning/walks',
      `commissioning/walks/${id}/sightings`, `commissioning/walks/${id}/finish`]) expect((await post(path)).status).toBe(200);
    expect((await GET(mobileRequest(`commissioning/walks/${id}/report`, auth),
      context(['commissioning', 'walks', id, 'report']))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(7);
    expect((await post('commissioning/walks/nope/finish')).status).toBe(404);
    expect((await GET(mobileRequest(`commissioning/walks/${id}/finish`), context(['commissioning', 'walks', id, 'finish']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(7);
  });

  it('forwards the spares routes, UUID-bound (WI-OI-136)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    for (const path of [`spares/assets/${id}/diagrams`, `spares/assets/${id}/work-orders`, `spares/diagrams/${id}`, `spares/diagrams/${id}/image`])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(200);
    for (const path of ['spares/resolve', 'spares/reservations'])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(6);
    expect((await GET(mobileRequest('spares/diagrams/nope'), context(['spares', 'diagrams', 'nope']))).status).toBe(404);
    expect((await GET(mobileRequest(`spares/diagrams/${id}/hotspots`), context(['spares', 'diagrams', id, 'hotspots']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(6);
  });

  // WI-OI-164: my work orders, one work order and its offers, the actions, the sign-off queue; the lists are the one
  // place a query passes, rebuilt from checked keys.
  it('forwards the work-order routes, UUID-bound, and only a checked list query (WI-OI-164)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    const upstream = () => String(upstreamFetch.mock.calls.at(-1)?.[0]);
    expect((await GET(mobileRequest('cmms/work-orders?lens=today&pageSize=25&query=%20pump%20', auth), context(['cmms', 'work-orders']))).status).toBe(200);
    expect(upstream()).toBe('https://control.example.invalid/api/v1/mobile/cmms/work-orders?lens=today&pageSize=25&query=pump');
    expect((await GET(mobileRequest('cmms/work-orders/awaiting-sign-off', auth), context(['cmms', 'work-orders', 'awaiting-sign-off']))).status).toBe(200);
    for (const path of [`cmms/work-orders/${id}`, `cmms/work-orders/${id}/actions`])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(200);
    for (const action of ['start', 'hold', 'resume', 'complete', 'sign-off']) {
      const path = `cmms/work-orders/${id}/actions/${action}`;
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    }
    expect(upstreamFetch).toHaveBeenCalledTimes(9);
    // A key the list does not take, a bad value, an unknown action or a non-UUID id never reaches the control plane.
    expect((await GET(mobileRequest('cmms/work-orders?tenant=other', auth), context(['cmms', 'work-orders']))).status).toBe(400);
    expect((await GET(mobileRequest('cmms/work-orders?status=CLOSED', auth), context(['cmms', 'work-orders']))).status).toBe(400);
    expect((await POST(mobileRequest(`cmms/work-orders/${id}/actions/delete`, { ...auth, method: 'POST', body: '{}' }),
      context(['cmms', 'work-orders', id, 'actions', 'delete']))).status).toBe(404);
    expect((await GET(mobileRequest('cmms/work-orders/not-a-uuid', auth), context(['cmms', 'work-orders', 'not-a-uuid']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(9);
    // Elsewhere a query is still dropped.
    await GET(mobileRequest('logbook/logbooks?tenant=other', auth), context(['logbook', 'logbooks']));
    expect(upstream()).toBe('https://control.example.invalid/api/v1/mobile/logbook/logbooks');
  });

  it('forwards the logbook routes, UUID-bound (WI-OI-137)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    for (const path of ['logbook/logbooks', `logbook/logbooks/${id}/board`])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(200);
    for (const path of [`logbook/logbooks/${id}/entries`, `logbook/logbooks/${id}/bypasses`, `logbook/logbooks/${id}/handovers`, `logbook/handovers/${id}/accept`])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(6);
    expect((await POST(mobileRequest(`logbook/handovers/${id}/countersign`, { method: 'POST', body: '{}' }),
      context(['logbook', 'handovers', id, 'countersign']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(6);
  });

  it('forwards the work-instruction routes, UUID- and step-key-bound (WI-OI-138)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    for (const path of ['sop/procedures', `sop/procedures/${id}`, `sop/procedures/${id}/steps/isolate/image`, 'sop/executions/awaiting-cosign', `sop/executions/${id}`])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(200);
    for (const path of ['sop/executions', `sop/executions/${id}/steps`, `sop/executions/${id}/complete`, `sop/executions/${id}/steps/isolate/cosign`, `sop/procedures/${id}/feedback`])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(10);
    expect(String(upstreamFetch.mock.calls[2]?.[0])).toContain(`/api/v1/mobile/sop/procedures/${id}/steps/isolate/image`);
    for (const path of [`sop/procedures/${id}/steps/Bad_Key/image`, `sop/procedures/${id}/steps/../image`, `sop/executions/${id}/steps/isolate/photo`])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(404);
    expect((await POST(mobileRequest(`sop/procedures/${id}/approve`, { ...auth, method: 'POST', body: '{}' }),
      context(['sop', 'procedures', id, 'approve']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(10);
  });

  it('forwards the fleet routes, UUID-bound (WI-OI-139)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    for (const path of [`fleet/assets/${id}`, 'fleet/groundings'])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(200);
    for (const path of ['fleet/resolve', 'fleet/inspections', 'fleet/groundings', `fleet/groundings/${id}/certify`])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(6);
    expect((await POST(mobileRequest(`fleet/groundings/${id}/clear`, { ...auth, method: 'POST', body: '{}' }),
      context(['fleet', 'groundings', id, 'clear']))).status).toBe(404);
    expect((await GET(mobileRequest('fleet/assets/nope', auth), context(['fleet', 'assets', 'nope']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(6);
  });

  it('forwards the problem-report routes (WI-OI-140)', async () => {
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    expect((await GET(mobileRequest('requests/mine', auth), context(['requests', 'mine']))).status).toBe(200);
    for (const path of ['requests/resolve', 'requests'])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(3);
    expect((await GET(mobileRequest('requests', auth), context(['requests']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(3);
  });

  it('forwards the safety routes, UUID-bound (WI-OI-141)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    for (const path of ['safety/reports/mine', 'safety/stop-work'])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(200);
    for (const path of ['safety/reports', `safety/stop-work/${id}/acknowledge`])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(4);
    expect((await POST(mobileRequest(`safety/stop-work/${id}/lift`, { ...auth, method: 'POST', body: '{}' }),
      context(['safety', 'stop-work', id, 'lift']))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(4);
  });

  it('forwards the permit routes, UUID- and point-key-bound (WI-OI-142)', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    upstreamFetch.mockImplementation(async () => new Response('{}', { status: 200 }));
    const auth = { headers: { Authorization: 'Bearer mobile-token' } };
    for (const path of ['permits/mine', 'permits/procedures', `permits/${id}`])
      expect((await GET(mobileRequest(path, auth), context(path.split('/')))).status).toBe(200);
    for (const path of ['permits', `permits/${id}/gas-tests`, `permits/${id}/lock-on`, `permits/${id}/lock-off`, `permits/${id}/de-isolate`,
      `permits/${id}/points/breaker/lock`, `permits/${id}/points/breaker/verify`, `permits/${id}/points/breaker/remove`])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(11);
    for (const path of [`permits/${id}/authorize`, `permits/${id}/countersign`, `permits/${id}/points/breaker/witness`])
      expect((await POST(mobileRequest(path, { ...auth, method: 'POST', body: '{}' }), context(path.split('/')))).status).toBe(404);
    expect(upstreamFetch).toHaveBeenCalledTimes(11);
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
