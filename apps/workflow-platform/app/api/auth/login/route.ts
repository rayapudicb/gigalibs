import { LoginWithEmailSchema } from '@gigalibs/contracts';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { readBoundedBody, unavailable } from '../../../../lib/authenticated-upstream';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessCookieOptions,
  controlPlaneUrl,
  isTokenResponse,
  refreshCookieOptions,
  tokenHasTenant,
} from '../../../../lib/control-plane';

// WI-OI-013: the control plane exclusively owns credentials and session issuance.
export async function POST(request: Request) {
  try {
    const rawBody = await readBoundedBody(request);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { detail: 'Request body must be valid JSON.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const parsed = LoginWithEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { detail: 'A valid email and password are required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const upstream = await fetch(controlPlaneUrl('/api/v1/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });

    if (!upstream.ok) {
      const status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 503;
      // WI-OI-120e (U3.2, P1-20): a locked sign-in says when it may be tried again.
      const retryAfterSeconds = status === 429 ? await lockRetryAfterSeconds(upstream) : null;
      return NextResponse.json(
        {
          detail:
            status === 401
              ? 'Invalid email or password.'
              : status === 429
                ? retryAfterSeconds
                  ? `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`
                  : 'Too many authentication requests. Try again later.'
                : status === 503
                  ? 'Authentication service is unavailable.'
                  : 'The authentication service rejected the request.',
        },
        {
          status,
          headers: {
            'Cache-Control': 'no-store',
            ...(retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {}),
          },
        },
      );
    }

    const tokenResponse: unknown = await upstream.json().catch(() => null);
    if (!isTokenResponse(tokenResponse)) {
      return NextResponse.json(
        { detail: 'Authentication service returned an invalid token contract.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(
      ACCESS_COOKIE_NAME,
      tokenResponse.accessToken,
      accessCookieOptions(tokenResponse.expiresIn),
    );
    cookieStore.set(REFRESH_COOKIE_NAME, tokenResponse.refreshToken, refreshCookieOptions());
    for (const legacyCookie of ['wf_session', 'wf_tenant', 'wf_user_id', 'wf_role']) {
      cookieStore.delete(legacyCookie);
    }

    const requiresTenantSelection = !tokenHasTenant(tokenResponse.accessToken);
    return NextResponse.json(
      {
        authenticated: true,
        requiresTenantSelection,
        requiresMfa: tokenResponse.requiresMfa === true,
        mfaEnrolled: tokenResponse.mfaEnrolled === true,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[API AUTH LOGIN ERROR]:', error);
    return unavailable(error);
  }
}

/** Seconds until a locked sign-in may be tried again, from the control plane's LOGIN_LOCKED answer (1 s to 1 h). */
async function lockRetryAfterSeconds(upstream: Response): Promise<number | null> {
  const body: unknown = await upstream.json().catch(() => null);
  if (!body || typeof body !== 'object' || (body as { code?: unknown }).code !== 'LOGIN_LOCKED') return null;
  const seconds = (body as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof seconds === 'number' && Number.isInteger(seconds) && seconds >= 1 && seconds <= 3_600 ? seconds : null;
}
