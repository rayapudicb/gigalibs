import { randomUUID } from 'node:crypto';
import { webConfig } from '@/lib/config';
import { oidcConfiguration } from '@/lib/oidc';
import {
  type ArWebSession,
  clearAuthCookies,
  now,
  openSession,
  sealSession,
  sessionCookieName,
  setSessionCookie,
} from '@/lib/session';
import { type NextRequest, NextResponse } from 'next/server';
import * as client from 'openid-client';

export const runtime = 'nodejs';
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

type RouteContext = { params: Promise<{ path: string[] }> };

export const GET = (request: NextRequest, context: RouteContext) => proxy(request, context);
export const POST = (request: NextRequest, context: RouteContext) => proxy(request, context);
export const PATCH = (request: NextRequest, context: RouteContext) => proxy(request, context);

async function proxy(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const config = webConfig();
  if (
    MUTATING_METHODS.has(request.method) &&
    request.headers.get('origin') !== new URL(config.webBaseUrl).origin
  ) {
    return problem(403, 'Cross-site request rejected.');
  }
  const { path } = await context.params;
  if (path.length < 1 || path.some((segment) => !/^[A-Za-z0-9._:-]{1,100}$/.test(segment))) {
    return problem(400, 'Invalid AR API path.');
  }
  let session = await openSession(request.cookies.get(sessionCookieName())?.value);
  if (!session) return problem(401, 'Sign in is required.');

  let refreshed = false;
  if (session.expiresAt <= now() + 30) {
    session = await refreshSession(session);
    if (!session) {
      const response = problem(401, 'Your session expired. Sign in again.');
      clearAuthCookies(response);
      return response;
    }
    refreshed = true;
  }

  let body: ArrayBuffer | undefined;
  if (MUTATING_METHODS.has(request.method)) {
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      return problem(415, 'AR write requests must use application/json.');
    }
    const length = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(length) && length > 1_000_000) return problem(413, 'Request is too large.');
    body = await request.arrayBuffer();
    if (body.byteLength > 1_000_000) return problem(413, 'Request is too large.');
  }

  const upstreamUrl = new URL(`${config.apiBaseUrl}/${path.join('/')}`);
  upstreamUrl.search = request.nextUrl.search;
  const headers = new Headers({
    authorization: `Bearer ${session.accessToken}`,
    accept: 'application/json, application/problem+json',
    'x-correlation-id': request.headers.get('x-correlation-id') ?? randomUUID(),
  });
  if (body) headers.set('content-type', 'application/json');
  copyHeader(request.headers, headers, 'idempotency-key');
  copyHeader(request.headers, headers, 'if-match');

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      ...(body ? { body } : {}),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const response = new NextResponse(upstream.body, { status: upstream.status });
    for (const name of ['content-type', 'etag', 'idempotency-replayed', 'x-correlation-id']) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }
    response.headers.set('cache-control', 'no-store');
    if (refreshed) setSessionCookie(response, await sealSession(session));
    return response;
  } catch {
    return problem(502, 'The AR service is temporarily unavailable.');
  }
}

async function refreshSession(session: ArWebSession): Promise<ArWebSession | undefined> {
  if (!session.refreshToken) return undefined;
  try {
    const tokens = await client.refreshTokenGrant(await oidcConfiguration(), session.refreshToken);
    if (!tokens.access_token) return undefined;
    return {
      sub: session.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      expiresAt: now() + Math.max(60, Math.min(tokens.expires_in ?? 300, 86_400)),
    };
  } catch {
    return undefined;
  }
}

function copyHeader(source: Headers, target: Headers, name: string): void {
  const value = source.get(name);
  if (value) target.set(name, value);
}

function problem(status: number, title: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status, correlationId: randomUUID() },
    {
      status,
      headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    },
  );
}
