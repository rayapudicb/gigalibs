import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as oidcCallback } from '../app/api/auth/oidc/callback/route';
import { GET, POST } from '../app/api/control/[...path]/route';

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

const upstreamFetch = vi.fn<typeof fetch>();

function accessToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1_000) + 300 }),
  ).toString('base64url');
  return `test.${payload}.test`;
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', upstreamFetch);
  vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
  vi.stubEnv('BFF_MAX_REQUEST_BYTES', '4096');
  vi.stubEnv('COOKIE_SECURE', 'true');
  cookieStore.get.mockReturnValue({ value: accessToken() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('WI-OI-013 external identity BFF boundary', () => {
  it('allows only the exact authenticated list and link-start paths', async () => {
    upstreamFetch
      .mockResolvedValueOnce(Response.json({ provider: null, identities: [] }))
      .mockResolvedValueOnce(
        Response.json({ authorizationUrl: 'https://identity.example.invalid/authorize' }),
      );

    const list = await GET(
      new Request('https://app.example.invalid/api/control/auth/external-identities'),
      context(['auth', 'external-identities']),
    );
    const start = await POST(
      new Request('https://app.example.invalid/api/control/auth/oidc/link/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Connect verified company identity' }),
      }),
      context(['auth', 'oidc', 'link', 'start']),
    );

    expect(list.status).toBe(200);
    expect(start.status).toBe(200);
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/auth/external-identities',
    );
    expect(upstreamFetch.mock.calls[1]?.[0]).toBe(
      'https://control.example.invalid/api/v1/auth/oidc/link/start',
    );
  });

  it('forwards a bounded self-service revocation body on the exact identity path', async () => {
    upstreamFetch.mockResolvedValue(Response.json({ status: 'REVOKED' }));
    const response = await POST(
      new Request(
        'https://app.example.invalid/api/control/auth/external-identities/identity-1/revoke',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedUpdatedAt: '2026-09-12T00:00:00.000Z',
            currentPassword: 'isolated-test-password',
            reason: 'Disconnect company identity',
          }),
        },
      ),
      context(['auth', 'external-identities', 'identity-1', 'revoke']),
    );

    expect(response.status).toBe(200);
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/auth/external-identities/identity-1/revoke',
    );
    expect(upstreamFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
    });
  });

  it.each([
    ['auth', 'oidc', 'link'],
    ['auth', 'oidc', 'link', 'start', 'extra'],
    ['auth', 'external-identities', 'identity-1'],
    ['auth', 'external-identities', 'identity-1', 'delete'],
  ])('keeps adjacent auth paths closed: %s', async (...path) => {
    const response = await POST(
      new Request(`https://app.example.invalid/api/control/${path.join('/')}`, { method: 'POST' }),
      context(path),
    );
    expect(response.status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('accepts a validated link callback without replacing the authenticated cookies', async () => {
    upstreamFetch.mockResolvedValue(
      Response.json({
        type: 'EXTERNAL_IDENTITY_LINKED',
        identityId: 'identity-1',
        tenantId: 'tenant-1',
        issuer: 'https://identity.example.invalid',
        status: 'ACTIVE',
        updatedAt: '2026-09-12T00:00:00.000Z',
      }),
    );
    const response = await oidcCallback(
      new Request('https://app.example.invalid/api/auth/oidc/callback?code=code-1&state=state-1'),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://app.example.invalid/settings/profile?identityLinked=1',
    );
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });
});
