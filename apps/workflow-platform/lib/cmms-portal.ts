import { randomUUID } from 'node:crypto';
import { RequestBodyError, readBoundedBody } from './authenticated-upstream';
import { controlPlaneUrl } from './control-plane';

// WI-OI-140 M-REQ: the public (no sign-in) request portal's front door. Three POST actions, a bounded JSON body, the
// client's address for throttling, and nothing else of the request: no cookie, no authorization, no tenant header,
// no query. The control plane checks the link's shape and tenant; CMMS proves the link and the rate.

const ACTIONS = new Set(['context', 'requests', 'status']);
const TIMEOUT_MS = 10_000;

function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ code }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const address = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return /^[0-9A-Fa-f:.]{2,45}$/.test(address) ? address : 'unknown';
}

export async function forwardPortalRequest(request: Request, action: string): Promise<Response> {
  if (request.method !== 'POST' || !ACTIONS.has(action)) return problem(404, 'PORTAL_NOT_FOUND');
  let body: string;
  try {
    body = await readBoundedBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) return problem(error.status === 413 ? 413 : 400, 'PORTAL_REQUEST_INVALID');
    throw error;
  }
  let upstream: Response;
  try {
    upstream = await fetch(controlPlaneUrl(`/api/v1/public/cmms-portal/${action}`), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Gigalibs-Client-Address': clientAddress(request),
        'X-Correlation-Id': randomUUID(),
      },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch {
    return problem(503, 'PORTAL_UNAVAILABLE');
  }
  const text = await upstream.text().catch(() => '');
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') throw new Error('not an object');
  } catch {
    return problem(upstream.ok ? 503 : upstream.status >= 500 ? 503 : upstream.status, upstream.ok ? 'PORTAL_UNAVAILABLE' : 'PORTAL_REQUEST_INVALID');
  }
  return new Response(text, { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
