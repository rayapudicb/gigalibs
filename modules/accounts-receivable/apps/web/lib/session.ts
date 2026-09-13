import { EncryptJWT, jwtDecrypt } from 'jose';
import type { NextResponse } from 'next/server';
import { webConfig } from './config';

export function sessionCookieName(): string {
  return webConfig().secureCookies ? '__Host-gigalibs_ar_session' : 'gigalibs_ar_session';
}

export function flowCookieName(): string {
  return webConfig().secureCookies ? '__Host-gigalibs_ar_oidc_flow' : 'gigalibs_ar_oidc_flow';
}

export interface ArWebSession {
  sub: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface OidcFlow {
  verifier: string;
  state: string;
  nonce: string;
  returnTo: string;
}

export async function sealSession(session: ArWebSession): Promise<string> {
  return seal({ ...session, kind: 'session' }, 60 * 60 * 24 * 30);
}

export async function openSession(value: string | undefined): Promise<ArWebSession | undefined> {
  const payload = await open(value, 'session');
  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    typeof payload.accessToken !== 'string' ||
    typeof payload.expiresAt !== 'number' ||
    (payload.refreshToken !== undefined && typeof payload.refreshToken !== 'string')
  ) {
    return undefined;
  }
  return {
    sub: payload.sub,
    accessToken: payload.accessToken,
    ...(payload.refreshToken ? { refreshToken: payload.refreshToken } : {}),
    expiresAt: payload.expiresAt,
  };
}

export async function sealFlow(flow: OidcFlow): Promise<string> {
  return seal({ ...flow, kind: 'flow' }, 600);
}

export async function openFlow(value: string | undefined): Promise<OidcFlow | undefined> {
  const payload = await open(value, 'flow');
  if (
    !payload ||
    typeof payload.verifier !== 'string' ||
    typeof payload.state !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.returnTo !== 'string'
  ) {
    return undefined;
  }
  return {
    verifier: payload.verifier,
    state: payload.state,
    nonce: payload.nonce,
    returnTo: safeReturnTo(payload.returnTo),
  };
}

export function setSessionCookie(response: NextResponse, sealed: string): void {
  assertCookieSize(sealed);
  response.cookies.set(sessionCookieName(), sealed, cookieOptions(60 * 60 * 24 * 30));
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(sessionCookieName(), '', cookieOptions(0));
  response.cookies.set(flowCookieName(), '', cookieOptions(0));
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return '/';
  return value;
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: webConfig().secureCookies,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    priority: 'high' as const,
  };
}

async function seal(payload: Record<string, unknown>, lifetime: number): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${lifetime}s`)
    .encrypt(webConfig().sessionSecret);
}

async function open(
  value: string | undefined,
  kind: string,
): Promise<Record<string, unknown> | undefined> {
  if (!value || value.length > 3800) return undefined;
  try {
    const { payload } = await jwtDecrypt(value, webConfig().sessionSecret, {
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    return payload.kind === kind ? payload : undefined;
  } catch {
    return undefined;
  }
}

function assertCookieSize(value: string): void {
  if (value.length > 3800) {
    throw new Error('OIDC token bundle exceeds the encrypted session-cookie safety limit.');
  }
}
