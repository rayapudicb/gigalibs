import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getComm, POST as postComm } from '../app/api/communications/[...path]/route';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

// WI-OI-120ak (S4, owner decision D2a): the route answers only from the Communications service. These tests used to
// check the in-memory store behind it (an invented WebRTC token, invented call attempts and their metering); the store
// is gone, and the rating itself is tested in packages/contracts/src/metering/communications-rating.test.ts.
const entitled = (tenantId = 'tenant-a') =>
  ({
    response: null,
    context: {
      user: { id: 'usr-1', email: 'user@example.com' },
      tenant: { id: tenantId, features: ['communications-textfly'] },
      permissions: ['communications:read', 'communications:write'],
      platformRoles: [],
    },
  }) as never;
const params = (...path: string[]) => ({ params: Promise.resolve({ path }) });
const get = (path: string) =>
  new Request(`https://platform.example.invalid/api/communications/${path}`, { method: 'GET' });

describe('Omnichannel Communications boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('denies unauthenticated GET /api/communications/channels with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json({ detail: 'Authentication required.' }, { status: 401 }),
    } as never);
    const res = await getComm(get('channels'), params('channels'));
    expect(res.status).toBe(401);
  });

  it('denies requests if tenant lacks communications module entitlement', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'user@example.com' },
        tenant: { id: 'tenant-no-comm', features: ['analytics'] },
        permissions: ['communications:read'],
        platformRoles: [],
      },
    } as never);
    const res = await getComm(get('channels'), params('channels'));
    expect(res.status).toBe(403);
    expect((await res.json()).title).toContain('Omnichannel Communications module is not enabled');
  });

  it('refuses even an entitled workspace while the module is contained (outside the UAT preview)', async () => {
    vi.stubEnv('GIGALIBS_UAT_PREVIEW', '');
    vi.mocked(verifiedSession).mockResolvedValue(entitled());
    const res = await getComm(get('channels'), params('channels'));
    expect(res.status).toBe(403);
  });

  describe('where the preview opens the module (UAT today)', () => {
    beforeEach(() => {
      vi.stubEnv('GIGALIBS_UAT_PREVIEW', 'enabled');
      vi.mocked(verifiedSession).mockResolvedValue(entitled());
    });

    it('answers 503 without its service, with no invented data', async () => {
      vi.stubEnv('COMMUNICATIONS_API_URL', '');
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      for (const path of [['channels'], ['voice', 'token'], ['inbox', 'conversations']]) {
        const res = await getComm(get(path.join('/')), params(...path));
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.title).toContain('not available on this instance');
        expect(body).not.toHaveProperty('channels');
        expect(body).not.toHaveProperty('token');
      }
      const send = new Request(
        'https://platform.example.invalid/api/communications/inbox/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://platform.example.invalid',
            Host: 'platform.example.invalid',
          },
          body: JSON.stringify({ text: 'hello' }),
        },
      );
      expect((await postComm(send, params('inbox', 'messages'))).status).toBe(503);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('answers 502 when its service fails, never a fallback', async () => {
      vi.stubEnv('COMMUNICATIONS_API_URL', 'https://communications.example.invalid');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
      const res = await getComm(get('channels'), params('channels'));
      expect(res.status).toBe(502);
      expect((await res.json()).title).toBe('The Communications service did not answer.');
    });

    it('passes the service answer through, for the signed-in tenant and user', async () => {
      vi.stubEnv('COMMUNICATIONS_API_URL', 'https://communications.example.invalid');
      const upstream = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ channels: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      vi.stubGlobal('fetch', upstream);
      const res = await getComm(get('channels?limit=5'), params('channels'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ channels: [] });
      const [target, init] = upstream.mock.calls[0];
      expect(String(target)).toBe('https://communications.example.invalid/channels?limit=5');
      expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant-a');
      expect(new Headers(init.headers).get('x-user-id')).toBe('usr-1');
    });
  });
});
