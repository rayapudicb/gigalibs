import { webConfig } from '@/lib/config';
import { oidcConfiguration } from '@/lib/oidc';
import { flowCookieName, safeReturnTo, sealFlow } from '@/lib/session';
import { type NextRequest, NextResponse } from 'next/server';
import * as client from 'openid-client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config = webConfig();
  const oidc = await oidcConfiguration();
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const nonce = client.randomNonce();
  const codeChallenge = await client.calculatePKCECodeChallenge(verifier);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const redirectUri = `${config.webBaseUrl}/auth/callback`;
  const authorizationUrl = client.buildAuthorizationUrl(oidc, {
    redirect_uri: redirectUri,
    scope: config.oidcScope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(flowCookieName(), await sealFlow({ verifier, state, nonce, returnTo }), {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
    priority: 'high',
  });
  return response;
}
