import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  UpstreamUnavailableError,
  accessCookieOptions,
  controlPlaneUrl,
  executionPlaneUrl,
  isTokenResponse,
  refreshCookieOptions,
} from './control-plane';

type UpstreamPlane = 'control' | 'execution';

export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413,
  ) {
    super(message);
  }
}

function requestBodyLimit(): number {
  const configured = process.env.BFF_MAX_REQUEST_BYTES?.trim();
  if (!configured || !/^\d+$/.test(configured)) {
    throw new Error('BFF_MAX_REQUEST_BYTES must be configured as a positive integer.');
  }
  const limit = Number(configured);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error('BFF_MAX_REQUEST_BYTES must be configured as a positive integer.');
  }
  return limit;
}

export async function readBoundedBody(request: Request): Promise<string> {
  const limit = requestBodyLimit();
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new RequestBodyError('Content-Length is invalid.', 400);
    if (Number(contentLength) > limit)
      throw new RequestBodyError('Request body is too large.', 413);
  }

  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestBodyError('Request body is too large.', 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError('Request body could not be read as UTF-8.', 400);
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) return null;

  let response: Response;
  try {
    response = await fetch(controlPlaneUrl('/api/v1/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new UpstreamUnavailableError('control');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    cookieStore.delete(ACCESS_COOKIE_NAME);
    cookieStore.delete(REFRESH_COOKIE_NAME);
    return null;
  }
  // An outage or invalid service response does not revoke a renewable session.
  if (!response.ok || !isTokenResponse(payload)) {
    throw new UpstreamUnavailableError('control');
  }
  cookieStore.set(ACCESS_COOKIE_NAME, payload.accessToken, accessCookieOptions(payload.expiresIn));
  cookieStore.set(REFRESH_COOKIE_NAME, payload.refreshToken, refreshCookieOptions());
  return payload.accessToken;
}

async function callUpstream(
  plane: UpstreamPlane,
  path: string,
  accessToken: string,
  init: RequestInit,
): Promise<Response> {
  const url = plane === 'control' ? controlPlaneUrl(path) : executionPlaneUrl(path);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  try {
    return await fetch(url, {
      ...init,
      headers,
      cache: 'no-store',
      redirect: 'error',
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
        : AbortSignal.timeout(10_000),
    });
  } catch {
    throw new UpstreamUnavailableError(plane);
  }
}

export async function authenticatedUpstream(
  plane: UpstreamPlane,
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get(ACCESS_COOKIE_NAME)?.value ?? null;
  if (!accessToken || accessTokenExpiresWithin(accessToken, 30)) {
    accessToken = await refreshAccessToken();
  }
  if (!accessToken) return null;
  // A 401 from an already-current token is an application denial. Replaying a
  // mutation can double failure counters or external side effects. Refresh is
  // therefore performed before dispatch only when the JWT is near expiry.
  return callUpstream(plane, path, accessToken, init);
}

function accessTokenExpiresWithin(accessToken: string, seconds: number): boolean {
  try {
    const encodedPayload = accessToken.split('.')[1];
    if (!encodedPayload) return false;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return (
      Number.isSafeInteger(payload.exp) &&
      Number(payload.exp) <= Math.floor(Date.now() / 1_000) + seconds
    );
  } catch {
    return false;
  }
}

export async function proxyUpstream(response: Response): Promise<NextResponse> {
  const body = await response.text();
  return new NextResponse(body || null, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}

export function authenticationRequired(): NextResponse {
  return NextResponse.json(
    { detail: 'Authentication required.' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function unavailable(error: unknown): NextResponse {
  if (error instanceof RequestBodyError) {
    return NextResponse.json(
      { detail: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(
    { detail: 'Service is temporarily synchronizing. Please try again shortly.' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
