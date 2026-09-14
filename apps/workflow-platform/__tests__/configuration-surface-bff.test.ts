import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/api/control/configuration/surfaces/route';

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

const upstreamFetch = vi.fn<typeof fetch>();

function accessToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1_000) + 300 }),
  ).toString('base64url');
  return `test.${payload}.test`;
}

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

describe('Configuration Studio surface registry BFF', () => {
  it('proxies the exact authenticated control-plane registry without a web-owned fallback', async () => {
    cookieStore.get.mockReturnValue({ value: accessToken() });
    upstreamFetch.mockResolvedValue(
      Response.json([
        {
          registrationKey: 'tenant-profile-extension',
          coreFields: [{ key: 'name' }],
          extensionSlots: [{ key: 'profile-details' }],
        },
      ]),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        registrationKey: 'tenant-profile-extension',
        coreFields: [{ key: 'name' }],
        extensionSlots: [{ key: 'profile-details' }],
      },
    ]);
    expect(upstreamFetch.mock.calls[0]?.[0]).toBe(
      'https://control.example.invalid/api/v1/configuration/surfaces',
    );
    expect(new Headers(upstreamFetch.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
      `Bearer ${accessToken()}`,
    );
  });

  it('fails closed when no authenticated session is available', async () => {
    cookieStore.get.mockReturnValue(undefined);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
