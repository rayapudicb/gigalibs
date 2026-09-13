import { webConfig } from '@/lib/config';
import { oidcConfiguration } from '@/lib/oidc';
import {
  clearAuthCookies,
  flowCookieName,
  now,
  openFlow,
  sealSession,
  setSessionCookie,
} from '@/lib/session';
import { type NextRequest, NextResponse } from 'next/server';
import * as client from 'openid-client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = webConfig();
  const flow = await openFlow(request.cookies.get(flowCookieName())?.value);
  if (!flow) return failedCallback('The sign-in transaction expired or is invalid.');

  try {
    const oidc = await oidcConfiguration();
    const externalCallback = new URL('/auth/callback', config.webBaseUrl);
    externalCallback.search = request.nextUrl.search;
    const tokens = await client.authorizationCodeGrant(oidc, externalCallback, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!tokens.access_token || !claims?.sub)
      return failedCallback('Identity response is incomplete.');
    const expiresAt = now() + Math.max(60, Math.min(tokens.expires_in ?? 300, 86_400));
    const sealed = await sealSession({
      sub: claims.sub,
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      expiresAt,
    });
    const response = NextResponse.redirect(new URL(flow.returnTo, config.webBaseUrl));
    response.cookies.set(flowCookieName(), '', {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    setSessionCookie(response, sealed);
    return response;
  } catch (error) {
    const safeError = error as {
      name?: unknown;
      code?: unknown;
      error?: unknown;
      status?: unknown;
    };
    console.error('AR OIDC callback rejected', {
      name: typeof safeError.name === 'string' ? safeError.name : 'UnknownError',
      code: typeof safeError.code === 'string' ? safeError.code : undefined,
      oauthError: typeof safeError.error === 'string' ? safeError.error : undefined,
      status: typeof safeError.status === 'number' ? safeError.status : undefined,
    });
    return failedCallback('Identity verification failed. Start a new sign-in.');
  }
}

function failedCallback(message: string): NextResponse {
  const response = NextResponse.json({ title: message, status: 401 }, { status: 401 });
  clearAuthCookies(response);
  return response;
}
