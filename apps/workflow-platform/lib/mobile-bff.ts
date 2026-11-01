import { MobileProblemV1Schema, type MobileProblemCode, mobileProblem } from '@gigalibs/contracts';
import { RequestBodyError, readBoundedBody } from './authenticated-upstream';
import { controlPlaneUrl } from './control-plane';

// WI-OI-120cf: the `/mobile/v1` BFF's front door. Only the routes listed here exist; each is forwarded to the control
// plane's mobile authority with the bearer and the app's own headers, and nothing else of the request: no cookie, no
// tenant header, no query. Every answer is `no-store`; a refusal is `application/problem+json` carrying only the
// mobile problem fields, and a control plane that cannot be reached or answers out of contract becomes a mobile
// problem too, never its own message.

const MOBILE_ROUTES: Readonly<Record<string, string>> = {
  'POST auth/password': '/api/v1/mobile/auth/password',
  'POST auth/mfa/verify': '/api/v1/mobile/auth/mfa/verify',
  'POST auth/refresh': '/api/v1/mobile/auth/refresh',
  'POST auth/logout': '/api/v1/mobile/auth/logout',
  'GET memberships': '/api/v1/mobile/memberships',
  'POST session/switch': '/api/v1/mobile/session/switch',
  'GET session': '/api/v1/mobile/session',
  'GET rounds/assignments': '/api/v1/mobile/rounds/assignments',
  'GET rounds/board': '/api/v1/mobile/rounds/board',
  'POST rounds/sync': '/api/v1/mobile/rounds/sync',
  'POST rounds/evidence': '/api/v1/mobile/rounds/evidence',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mobileUpstreamPath(method: string, path: readonly string[]): string | undefined {
  const exact = MOBILE_ROUTES[`${method} ${path.join('/')}`];
  if (exact) return exact;
  if (method === 'GET' && path.length === 4 && path[0] === 'rounds' &&
      path[1] === 'assignments' && path[3] === 'bundle' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/rounds/assignments/${path[2]}/bundle`;
  if (method === 'GET' && path.length === 4 && path[0] === 'rounds' &&
      path[1] === 'assignments' && path[3] === 'history' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/rounds/assignments/${path[2]}/history`;
  if (method === 'GET' && path.length === 4 && path[0] === 'rounds' &&
      path[1] === 'assignments' && path[3] === 'offline-grant' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/rounds/assignments/${path[2]}/offline-grant`;
  if (method === 'GET' && path.length === 3 && path[0] === 'rounds' &&
      path[1] === 'receipts' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/rounds/receipts/${path[2]}`;
  if (method === 'POST' && path.length === 4 && path[0] === 'rounds' &&
      path[1] === 'evidence' && path[3] === 'commit' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/rounds/evidence/${path[2]}/commit`;
  return undefined;
}

const FORWARDED_HEADERS = [
  'authorization',
  'idempotency-key',
  'x-correlation-id',
  'x-gigalibs-app-profile',
  'x-gigalibs-app-version',
  'x-gigalibs-installation-id',
  'x-gigalibs-runtime-version',
] as const;

const UPSTREAM_TIMEOUT_MS = 10_000;

export function mobileProblemResponse(code: MobileProblemCode): Response {
  const problem = mobileProblem(code);
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
  });
}

export async function forwardMobileRequest(request: Request, path: readonly string[]): Promise<Response> {
  const upstreamPath = mobileUpstreamPath(request.method, path);
  if (!upstreamPath) return mobileProblemResponse('MOBILE_NOT_FOUND');

  let body: string | undefined;
  if (request.method === 'POST') {
    try {
      body = await readBoundedBody(request);
    } catch (error) {
      if (error instanceof RequestBodyError) return mobileProblemResponse('MOBILE_REQUEST_INVALID');
      throw error;
    }
  }
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(controlPlaneUrl(upstreamPath), {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch (error) {
    return mobileProblemResponse(error instanceof Error && error.name === 'TimeoutError' ? 'MOBILE_UPSTREAM_TIMEOUT' : 'MOBILE_UNAVAILABLE');
  }

  if (upstream.status === 204) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  const text = await upstream.text().catch(() => '');
  if (upstream.ok) {
    try {
      JSON.parse(text);
    } catch {
      return mobileProblemResponse('MOBILE_UNAVAILABLE');
    }
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  let problem: ReturnType<typeof MobileProblemV1Schema.safeParse> | null = null;
  try {
    problem = MobileProblemV1Schema.safeParse(JSON.parse(text));
  } catch {
    problem = null;
  }
  if (problem?.success && problem.data.status === upstream.status && problem.data.code.startsWith('MOBILE_')) {
    return new Response(JSON.stringify(problem.data), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
    });
  }
  // A control plane without the mobile routes, or one answering outside the contract.
  return mobileProblemResponse(upstream.status === 404 ? 'MOBILE_NOT_FOUND' : 'MOBILE_UNAVAILABLE');
}
