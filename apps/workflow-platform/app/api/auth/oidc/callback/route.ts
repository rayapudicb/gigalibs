import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  accessCookieOptions,
  controlPlaneUrl,
  isTokenResponse,
  refreshCookieOptions,
} from '@/lib/control-plane';
import { requestOrigin } from '@/lib/request-origin';
import {
  CompleteOidcAuthorizationResponseSchema,
  CompleteOidcLoginSchema,
} from '@gigalibs/contracts';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const parsed = CompleteOidcLoginSchema.safeParse({
    code: query.get('code') ?? undefined,
    state: query.get('state') ?? undefined,
    error: query.get('error') ?? undefined,
    errorDescription: query.get('error_description') ?? undefined,
  });
  if (!parsed.success) return failed(request, 'invalid');
  try {
    const upstream = await fetch(controlPlaneUrl('/api/v1/auth/oidc/callback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return failed(
        request,
        upstream.status >= 400 && upstream.status < 500 ? 'rejected' : 'unavailable',
      );
    }
    const callbackResponse: unknown = await upstream.json().catch(() => null);
    const validated = CompleteOidcAuthorizationResponseSchema.safeParse(callbackResponse);
    if (!validated.success) return failed(request, 'invalid');
    if ('type' in validated.data && validated.data.type === 'EXTERNAL_IDENTITY_LINKED') {
      return NextResponse.redirect(
        new URL('/settings/profile?identityLinked=1', requestOrigin(request)),
      );
    }
    const tokenResponse = validated.data;
    if (!isTokenResponse(tokenResponse)) return failed(request, 'invalid');
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
    return NextResponse.redirect(
      new URL(tokenResponse.requiresMfa === true ? '/mfa' : '/modules', requestOrigin(request)),
    );
  } catch {
    return failed(request, 'unavailable');
  }
}

async function failed(request: Request, reason: string) {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE_NAME);
  cookieStore.delete(REFRESH_COOKIE_NAME);
  return NextResponse.redirect(new URL(`/login?ssoError=${reason}`, requestOrigin(request)));
}
