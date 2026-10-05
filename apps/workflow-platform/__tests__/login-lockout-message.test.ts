import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '../app/api/auth/login/route';

// WI-OI-120e (U3.2, P1-20): a locked sign-in tells the person when to try again. Test-only upstream answers; no
// server, database or provider is contacted.
const cookieStore = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));

const upstreamFetch = vi.fn<typeof fetch>();
const request = () =>
  new Request('https://bff.example.invalid/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'lockout-test@example.invalid', password: 'isolated-regression-password' }),
  });

beforeEach(() => {
  upstreamFetch.mockReset();
  vi.stubGlobal('fetch', upstreamFetch);
  vi.stubEnv('CONTROL_PLANE_API_URL', 'https://control.example.invalid');
  vi.stubEnv('BFF_MAX_REQUEST_BYTES', '4096');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('sign-in lockout message', () => {
  it('says how many minutes to wait and passes Retry-After', async () => {
    upstreamFetch.mockResolvedValue(
      Response.json(
        { code: 'LOGIN_LOCKED', message: 'locked', retryAt: '2026-10-05T10:00:00.000Z', retryAfterSeconds: 841 },
        { status: 429 },
      ),
    );
    const response = await login(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('841');
    await expect(response.json()).resolves.toEqual({
      detail: 'Too many failed sign-in attempts. Try again in 15 minute(s).',
    });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('keeps the general message for any other 429, and ignores an out-of-range retry time', async () => {
    upstreamFetch.mockResolvedValueOnce(Response.json({ message: 'slow down' }, { status: 429 }));
    const general = await login(request());
    expect(general.headers.get('Retry-After')).toBeNull();
    await expect(general.json()).resolves.toEqual({ detail: 'Too many authentication requests. Try again later.' });

    upstreamFetch.mockResolvedValueOnce(Response.json({ code: 'LOGIN_LOCKED', retryAfterSeconds: 99_999 }, { status: 429 }));
    const outOfRange = await login(request());
    expect(outOfRange.headers.get('Retry-After')).toBeNull();
  });

  it('still answers a wrong password with the same 401 text', async () => {
    upstreamFetch.mockResolvedValue(Response.json({ message: 'Invalid email or password' }, { status: 401 }));
    const response = await login(request());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: 'Invalid email or password.' });
  });
});
