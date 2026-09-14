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
  upstreamError,
} from '../../../../lib/control-plane';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value;
  if (!accessToken) {
    return NextResponse.json(
      { detail: 'Authentication required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  let body: { tenantId?: unknown };
  try {
    const raw = await readBoundedBody(request);
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { detail: 'Invalid JSON.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } catch (error) {
    return unavailable(error);
  }
  if (!body || typeof body.tenantId !== 'string' || body.tenantId.length === 0) {
    return NextResponse.json(
      { detail: 'A tenant must be selected.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const upstream = await fetch(controlPlaneUrl('/api/v1/auth/select-tenant'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenantId: body.tenantId }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    if (upstream.status >= 500) return unavailable(null);
    if (!upstream.ok) {
      return NextResponse.json(
        { detail: await upstreamError(upstream) },
        { status: upstream.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const tokenResponse: unknown = await upstream.json();
    if (!isTokenResponse(tokenResponse)) {
      return NextResponse.json(
        { detail: 'Tenant service returned an invalid token contract.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    cookieStore.set(
      ACCESS_COOKIE_NAME,
      tokenResponse.accessToken,
      accessCookieOptions(tokenResponse.expiresIn),
    );
    cookieStore.set(REFRESH_COOKIE_NAME, tokenResponse.refreshToken, refreshCookieOptions());
    return NextResponse.json(
      {
        authenticated: true,
        requiresMfa: tokenResponse.requiresMfa === true,
        mfaEnrolled: tokenResponse.mfaEnrolled === true,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { detail: 'Tenant service is unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
