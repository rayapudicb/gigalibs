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
  // WI-OI-134 M-CAL.
  'GET calibration/instruments': '/api/v1/mobile/calibration/instruments',
  'POST calibration/records': '/api/v1/mobile/calibration/records',
  // WI-OI-135 M-TAG.
  'GET commissioning/context': '/api/v1/mobile/commissioning/context',
  'POST commissioning/requests': '/api/v1/mobile/commissioning/requests',
  'POST commissioning/tags/resolve': '/api/v1/mobile/commissioning/tags/resolve',
  'POST commissioning/walks': '/api/v1/mobile/commissioning/walks',
  // WI-OI-136 M-BOM.
  'POST spares/resolve': '/api/v1/mobile/spares/resolve',
  'POST spares/reservations': '/api/v1/mobile/spares/reservations',
  // WI-OI-137 M-LOG.
  'GET logbook/logbooks': '/api/v1/mobile/logbook/logbooks',
  // WI-OI-138 M-SOP.
  'GET sop/procedures': '/api/v1/mobile/sop/procedures',
  'GET sop/executions/awaiting-cosign': '/api/v1/mobile/sop/executions/awaiting-cosign',
  'POST sop/executions': '/api/v1/mobile/sop/executions',
  // WI-OI-139 M-DVIR.
  'POST fleet/resolve': '/api/v1/mobile/fleet/resolve',
  'POST fleet/inspections': '/api/v1/mobile/fleet/inspections',
  'GET fleet/groundings': '/api/v1/mobile/fleet/groundings',
  'POST fleet/groundings': '/api/v1/mobile/fleet/groundings',
  // WI-OI-140 M-REQ.
  'POST requests/resolve': '/api/v1/mobile/requests/resolve',
  'POST requests': '/api/v1/mobile/requests',
  'GET requests/mine': '/api/v1/mobile/requests/mine',
  // WI-OI-141 M-INC.
  'POST safety/reports': '/api/v1/mobile/safety/reports',
  'GET safety/reports/mine': '/api/v1/mobile/safety/reports/mine',
  'GET safety/stop-work': '/api/v1/mobile/safety/stop-work',
  // WI-OI-143 M-CONTR.
  'POST contractors/enroll': '/api/v1/mobile/contractors/enroll',
  'GET contractors/worker/mine': '/api/v1/mobile/contractors/worker/mine',
  'POST contractors/induction': '/api/v1/mobile/contractors/induction',
  'GET contractors/pass/mine': '/api/v1/mobile/contractors/pass/mine',
  'POST contractors/pass/verify': '/api/v1/mobile/contractors/pass/verify',
  'GET contractors/roster': '/api/v1/mobile/contractors/roster',
  // WI-OI-142 M-LOTO.
  'GET permits/mine': '/api/v1/mobile/permits/mine',
  'GET permits/procedures': '/api/v1/mobile/permits/procedures',
  'POST permits': '/api/v1/mobile/permits',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STEP_KEY = /^[a-z][a-z0-9-]{0,31}$/;

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
  if (method === 'GET' && path.length === 4 && path[0] === 'calibration' &&
      path[1] === 'instruments' && path[3] === 'bundle' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/calibration/instruments/${path[2]}/bundle`;
  if (method === 'GET' && path.length === 3 && path[0] === 'calibration' &&
      path[1] === 'records' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/calibration/records/${path[2]}`;
  if (path.length === 4 && path[0] === 'commissioning' && path[1] === 'walks' && UUID.test(path[2] ?? '')) {
    if (method === 'POST' && (path[3] === 'sightings' || path[3] === 'finish'))
      return `/api/v1/mobile/commissioning/walks/${path[2]}/${path[3]}`;
    if (method === 'GET' && path[3] === 'report') return `/api/v1/mobile/commissioning/walks/${path[2]}/report`;
  }
  if (method === 'GET' && path.length === 4 && path[0] === 'spares' && path[1] === 'assets' && UUID.test(path[2] ?? '') &&
      (path[3] === 'diagrams' || path[3] === 'work-orders'))
    return `/api/v1/mobile/spares/assets/${path[2]}/${path[3]}`;
  if (method === 'GET' && path[0] === 'spares' && path[1] === 'diagrams' && UUID.test(path[2] ?? '') &&
      (path.length === 3 || (path.length === 4 && path[3] === 'image')))
    return `/api/v1/mobile/spares/diagrams/${path[2]}${path.length === 4 ? '/image' : ''}`;
  if (path.length === 4 && path[0] === 'logbook' && path[1] === 'logbooks' && UUID.test(path[2] ?? '')) {
    if (method === 'GET' && path[3] === 'board') return `/api/v1/mobile/logbook/logbooks/${path[2]}/board`;
    if (method === 'POST' && ['entries', 'bypasses', 'handovers'].includes(path[3] ?? ''))
      return `/api/v1/mobile/logbook/logbooks/${path[2]}/${path[3]}`;
  }
  if (method === 'POST' && path.length === 4 && path[0] === 'logbook' && path[1] === 'handovers' && UUID.test(path[2] ?? '') &&
      path[3] === 'accept')
    return `/api/v1/mobile/logbook/handovers/${path[2]}/accept`;
  if (path[0] === 'sop' && path[1] === 'procedures' && UUID.test(path[2] ?? '')) {
    if (method === 'GET' && path.length === 3) return `/api/v1/mobile/sop/procedures/${path[2]}`;
    if (method === 'POST' && path.length === 4 && path[3] === 'feedback') return `/api/v1/mobile/sop/procedures/${path[2]}/feedback`;
    if (method === 'GET' && path.length === 6 && path[3] === 'steps' && STEP_KEY.test(path[4] ?? '') && path[5] === 'image')
      return `/api/v1/mobile/sop/procedures/${path[2]}/steps/${path[4]}/image`;
  }
  if (path[0] === 'sop' && path[1] === 'executions' && UUID.test(path[2] ?? '')) {
    if (method === 'GET' && path.length === 3) return `/api/v1/mobile/sop/executions/${path[2]}`;
    if (method === 'POST' && path.length === 4 && (path[3] === 'steps' || path[3] === 'complete'))
      return `/api/v1/mobile/sop/executions/${path[2]}/${path[3]}`;
    if (method === 'POST' && path.length === 6 && path[3] === 'steps' && STEP_KEY.test(path[4] ?? '') && path[5] === 'cosign')
      return `/api/v1/mobile/sop/executions/${path[2]}/steps/${path[4]}/cosign`;
  }
  if (method === 'GET' && path.length === 3 && path[0] === 'fleet' && path[1] === 'assets' && UUID.test(path[2] ?? ''))
    return `/api/v1/mobile/fleet/assets/${path[2]}`;
  if (method === 'POST' && path.length === 4 && path[0] === 'fleet' && path[1] === 'groundings' && UUID.test(path[2] ?? '') &&
      path[3] === 'certify')
    return `/api/v1/mobile/fleet/groundings/${path[2]}/certify`;
  if (method === 'POST' && path.length === 4 && path[0] === 'safety' && path[1] === 'stop-work' && UUID.test(path[2] ?? '') &&
      path[3] === 'acknowledge')
    return `/api/v1/mobile/safety/stop-work/${path[2]}/acknowledge`;
  if (path[0] === 'contractors' && path[1] === 'visits' && UUID.test(path[2] ?? '')) {
    if (method === 'POST' && path[3] === 'checkout') return `/api/v1/mobile/contractors/visits/${path[2]}/checkout`;
    if (method === 'POST' && path[3] === 'escort') return `/api/v1/mobile/contractors/visits/${path[2]}/escort`;
  }
  if (path[0] === 'permits' && UUID.test(path[1] ?? '')) {
    if (method === 'GET' && path.length === 2) return `/api/v1/mobile/permits/${path[1]}`;
    if (method === 'POST' && path.length === 3 && ['gas-tests', 'lock-on', 'lock-off', 'de-isolate'].includes(path[2] ?? ''))
      return `/api/v1/mobile/permits/${path[1]}/${path[2]}`;
    if (method === 'POST' && path.length === 5 && path[2] === 'points' && STEP_KEY.test(path[3] ?? '') &&
        ['lock', 'verify', 'remove'].includes(path[4] ?? ''))
      return `/api/v1/mobile/permits/${path[1]}/points/${path[3]}/${path[4]}`;
  }
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
