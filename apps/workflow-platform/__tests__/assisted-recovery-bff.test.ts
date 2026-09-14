import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  cookieStore.get.mockReturnValue({ value: accessToken() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('WI-OI-013 assisted-recovery BFF boundary', () => {
  it('allows the exact tenant-scoped recovery collection route', async () => {
    upstreamFetch.mockResolvedValue(Response.json([]));
    const response = await GET(
      new Request('https://app.example.invalid/api/control/auth/mfa/assisted-recovery'),
      context(['auth', 'mfa', 'assisted-recovery']),
    );
    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledTimes(1);
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/auth/mfa/assisted-recovery',
    );
  });

  it.each(['approve', 'reject'])(
    'proxies the exact %s decision with a bounded body',
    async (decision) => {
      upstreamFetch.mockResolvedValue(Response.json({ status: decision.toUpperCase() }));
      const response = await POST(
        new Request(
          `https://app.example.invalid/api/control/auth/mfa/assisted-recovery/recovery-1/${decision}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Verified support evidence' }),
          },
        ),
        context(['auth', 'mfa', 'assisted-recovery', 'recovery-1', decision]),
      );
      expect(response.status).toBe(200);
      expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
        `https://control.example.invalid/api/v1/auth/mfa/assisted-recovery/recovery-1/${decision}`,
      );
      expect(upstreamFetch.mock.calls[0]?.[1]).toMatchObject({
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
      });
    },
  );

  it('allows grant consumption while preserving the authenticated session boundary', async () => {
    upstreamFetch.mockResolvedValue(
      Response.json({ recovered: true, enrollmentRequired: true, method: 'ASSISTED_RECOVERY' }),
    );
    const response = await POST(
      new Request('https://app.example.invalid/api/control/auth/mfa/assisted-recovery/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant: 'a'.repeat(43) }),
      }),
      context(['auth', 'mfa', 'assisted-recovery', 'consume']),
    );
    expect(response.status).toBe(200);
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/auth/mfa/assisted-recovery/consume',
    );
  });

  it.each([
    ['auth', 'mfa', 'totp', 'enroll'],
    ['auth', 'mfa', 'assisted-recovery', 'recovery-1', 'delete'],
    ['auth', 'mfa', 'assisted-recovery', 'recovery-1', 'approve', 'extra'],
  ])('keeps unrelated auth paths closed: %s', async (...path) => {
    const response = await POST(
      new Request(`https://app.example.invalid/api/control/${path.join('/')}`, { method: 'POST' }),
      context(path),
    );
    expect(response.status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
