import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '../app/api/auth/login/route';
import { POST as register } from '../app/api/auth/register/route';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from '../lib/control-plane';

const cookieStore = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

// Test-only upstream responses; no server, database, or provider is contacted.
const upstreamFetch = vi.fn<typeof fetch>();
const input = {
  email: 'iam-boundary-test@example.invalid',
  password: 'isolated-regression-password',
  name: 'Isolated IAM regression',
};

function tokenResponse(tenantId?: string) {
  const payload = {
    sub: 'test-user',
    sid: 'test-session',
    roles: [],
    ...(tenantId ? { tid: tenantId } : {}),
  };
  return {
    accessToken: `test.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test`,
    refreshToken: 'isolated-refresh-token',
    expiresIn: 300,
    tokenType: 'Bearer',
  };
}

function request(action: string, body: unknown = input, headers?: HeadersInit) {
  return new Request(`https://bff.example.invalid/api/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  upstreamFetch.mockReset();
  vi.stubGlobal('fetch', upstreamFetch);
  vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
  vi.stubEnv('BFF_MAX_REQUEST_BYTES', '4096');
  vi.stubEnv('COOKIE_SECURE', 'true');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each([
  { action: 'login', handler: login, successStatus: 200 },
  { action: 'register', handler: register, successStatus: 201 },
])(
  'WI-OI-013: $action fails closed at the control-plane boundary',
  ({ action, handler, successStatus }) => {
    it('rejects missing configuration without creating any session', async () => {
      vi.stubEnv('CONTROL_PLANE_API_URL', '');
      const response = await handler(request(action));
      expect(response.status).toBe(503);
      expect(await response.json()).not.toHaveProperty('authenticated');
      expect(upstreamFetch).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it.each(['https://[invalid', 'file:///untrusted'])(
      'rejects invalid control-plane configuration %s',
      async (url) => {
        vi.stubEnv('CONTROL_PLANE_API_URL', url);
        expect((await handler(request(action))).status).toBe(503);
        expect(upstreamFetch).not.toHaveBeenCalled();
        expect(cookieStore.set).not.toHaveBeenCalled();
      },
    );

    it.each([
      new Error('sensitive-provider-error'),
      new DOMException('sensitive-timeout-detail', 'TimeoutError'),
    ])('does not issue a token after network failure or timeout', async (error) => {
      upstreamFetch.mockRejectedValue(error);
      const response = await handler(request(action));
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('sensitive-');
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it.each([400, 401, 403, 409, 429, 500, 503])(
      'preserves denial without leaking upstream details for %s',
      async (status) => {
        upstreamFetch.mockResolvedValue(
          Response.json({ detail: 'sensitive-provider-error' }, { status }),
        );
        const response = await handler(request(action));
        expect(response.status).toBe(status < 500 ? status : 503);
        const text = await response.text();
        expect(text).not.toContain('sensitive-provider-error');
        expect(text).not.toContain('authenticated');
        expect(cookieStore.set).not.toHaveBeenCalled();
      },
    );

    it('rejects malformed JSON before any upstream request', async () => {
      const malformed = new Request(`https://bff.example.invalid/api/auth/${action}`, {
        method: 'POST',
        body: '{',
      });
      expect((await handler(malformed)).status).toBe(400);
      expect(upstreamFetch).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it.each([null, [], {}, { ...input, email: 123 }, { ...input, password: '' }])(
      'validates the canonical request schema',
      async (body) => {
        expect((await handler(request(action, body))).status).toBe(400);
        expect(upstreamFetch).not.toHaveBeenCalled();
        expect(cookieStore.set).not.toHaveBeenCalled();
      },
    );

    it('rejects bodies exceeding the configured byte limit without trusting Content-Length', async () => {
      const response = await handler(request(action, { ...input, extra: 'x'.repeat(5000) }));
      expect(response.status).toBe(413);
      expect(upstreamFetch).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it('fails closed if the body limit is not configured', async () => {
      vi.stubEnv('BFF_MAX_REQUEST_BYTES', '');
      expect((await handler(request(action))).status).toBe(503);
      expect(upstreamFetch).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it.each([
      null,
      {},
      { accessToken: 'test-only-token' },
      { ...tokenResponse(), accessToken: '' },
      { ...tokenResponse(), refreshToken: '' },
      { ...tokenResponse(), expiresIn: 0 },
      { ...tokenResponse(), expiresIn: 1.5 },
      { ...tokenResponse(), tokenType: 'Unexpected' },
      { ...tokenResponse(), requiresMfa: 'yes' },
      { tenant: { id: 'test-tenant' }, adminUser: { id: 'test-user' } },
    ])('rejects successful upstream responses outside TokenResponse', async (payload) => {
      upstreamFetch.mockResolvedValue(Response.json(payload));
      const response = await handler(request(action));
      expect(response.status).toBe(502);
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it('rejects a successful upstream response with malformed JSON', async () => {
      upstreamFetch.mockResolvedValue(new Response('{invalid'));
      expect((await handler(request(action))).status).toBe(502);
      expect(cookieStore.set).not.toHaveBeenCalled();
    });

    it.each([undefined, 'isolated-test-tenant'])(
      'uses only the upstream session and its tenant selection state',
      async (tenantId) => {
        const tokens = tokenResponse(tenantId);
        upstreamFetch.mockResolvedValue(Response.json(tokens, { status: successStatus }));
        const response = await handler(
          request(action, {
            ...input,
            role: 'SUPER_ADMIN',
            tenantId: 'injected-tenant',
            companyName: 'Injected Company',
            slug: 'injected',
            isolationMode: 'DEDICATED_DATABASE',
            plan: 'ENTERPRISE',
          }),
        );
        expect(response.status).toBe(successStatus);
        const result = await response.json();
        expect(result).toMatchObject({ authenticated: true, requiresTenantSelection: !tenantId });
        expect(result).not.toHaveProperty('accessToken');
        expect(result).not.toHaveProperty('refreshToken');
        expect(result).not.toHaveProperty('tenant');
        expect(result).not.toHaveProperty('role');
        if (action === 'register') {
          expect(result.redirectUrl).toBe(tenantId ? '/modules' : '/select-tenant');
        }
        expect(upstreamFetch).toHaveBeenCalledTimes(1);
        const [url, options] = upstreamFetch.mock.calls[0]!;
        expect(url).toBe(`https://control.example.invalid/api/v1/auth/${action}`);
        expect(JSON.parse(options!.body as string)).toEqual(
          action === 'register' ? input : { email: input.email, password: input.password },
        );
        expect(options).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' });
        expect(options!.signal).toBeInstanceOf(AbortSignal);
        expect(cookieStore.set).toHaveBeenCalledTimes(2);
        expect(cookieStore.set).toHaveBeenCalledWith(
          ACCESS_COOKIE_NAME,
          tokens.accessToken,
          expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300 }),
        );
        expect(cookieStore.set).toHaveBeenCalledWith(
          REFRESH_COOKIE_NAME,
          tokens.refreshToken,
          expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }),
        );
        for (const name of ['wf_session', 'wf_tenant', 'wf_role', 'wf_user_id']) {
          expect(cookieStore.delete).toHaveBeenCalledWith(name);
        }
      },
    );

    it('aborts the upstream when the caller has disconnected', async () => {
      const controller = new AbortController();
      controller.abort();
      upstreamFetch.mockImplementation(async (_url, options) => {
        expect(options!.signal!.aborted).toBe(true);
        throw new DOMException('Request aborted', 'AbortError');
      });
      const abortedRequest = new Request(request(action), { signal: controller.signal });
      expect((await handler(abortedRequest)).status).toBe(503);
      expect(cookieStore.set).not.toHaveBeenCalled();
    });
  },
);

it('WI-OI-013: registration enforces the canonical password length before creating an account', async () => {
  for (const password of ['short', 'x'.repeat(129)]) {
    const response = await register(request('register', { ...input, password }));
    expect(response.status).toBe(400);
  }
  expect(upstreamFetch).not.toHaveBeenCalled();
  expect(cookieStore.set).not.toHaveBeenCalled();
});
