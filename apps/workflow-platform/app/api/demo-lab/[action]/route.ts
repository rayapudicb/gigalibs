import { randomUUID } from 'node:crypto';
import { analyticsModule } from '@/lib/analytics-proxy';
import { authenticatedUpstream, readBoundedBody } from '@/lib/authenticated-upstream';
import { hasPermission } from '@/lib/module-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { callSignedModule } from '@/lib/signed-module-proxy';
import { verifiedSession } from '@/lib/verified-session';
import {
  MAX_DEMO_LAB_FACTS,
  MAX_PLACE_ANALYTICS_WINDOW_DAYS,
  estimateDemoLabFacts,
  type DemoLabGenerateRequestV1,
  type IndustryPackV1,
} from '@gigalibs/contracts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ action: string }> };
/** Optional `{ days, seed }`; anything else is rejected. */
function generateOptions(raw: string): { days?: number; seed?: number } | null {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { days, seed, ...rest } = value as Record<string, unknown>;
  const integer = (candidate: unknown, min: number, max: number) =>
    candidate === undefined || (Number.isInteger(candidate) && (candidate as number) >= min && (candidate as number) <= max);
  if (Object.keys(rest).length > 0 || !integer(days, 7, MAX_PLACE_ANALYTICS_WINDOW_DAYS) || !integer(seed, 0, 2_147_483_647)) {
    return null;
  }
  return { days: days as number | undefined, seed: seed as number | undefined };
}

// WI-OI-064e: Demo Lab data actions exist only inside workspaces labelled `demo-lab` (synthetic data only).
export async function GET(_request: Request, context: RouteContext) {
  const session = await demoSession();
  if ('response' in session) return session.response;
  if ((await context.params).action !== 'dataset') return problem(404, 'Unsupported Demo Lab action.');
  return relay(await callSignedModule(analyticsModule, session.context, 'GET', ['v1', 'demo-lab', 'dataset']));
}

export async function POST(request: Request, context: RouteContext) {
  const session = await demoSession();
  if ('response' in session) return session.response;
  if (!hasSameOrigin(request)) return problem(403, 'Cross-site request rejected.');
  const action = (await context.params).action;
  try {
    if (action === 'generate') return await generate(request, session.context);
    if (action === 'reset') {
      if (!hasPermission(session.context.permissions, 'analytics:action')) return problem(403, 'Permission analytics:action is required.');
      return relay(await callSignedModule(analyticsModule, session.context, 'POST', ['v1', 'demo-lab', 'reset'], {}, 60_000));
    }
    if (action === 'delete') return await remove(session.context);
    return problem(404, 'Unsupported Demo Lab action.');
  } catch (error) {
    return problem(502, error instanceof Error && error.name === 'TimeoutError' ? 'The Demo Lab request timed out.' : 'Demo Lab is temporarily unavailable.');
  }
}

type Session = Extract<Awaited<ReturnType<typeof verifiedSession>>, { context: unknown }>['context'];

async function demoSession(): Promise<{ context: Session } | { response: NextResponse }> {
  const session = await verifiedSession(true);
  if (session.response) return { response: session.response };
  if (!session.context.tenant?.features.includes('demo-lab')) {
    return { response: problem(404, 'Demo Lab actions are only available in Demo Lab workspaces.') };
  }
  return { context: session.context };
}

async function generate(request: Request, session: Session): Promise<NextResponse> {
  if (!hasPermission(session.permissions, 'analytics:action')) return problem(403, 'Permission analytics:action is required.');
  const raw = await readBoundedBody(request);
  const options = generateOptions(raw);
  if (!options) return problem(400, `Send optional days (7–${MAX_PLACE_ANALYTICS_WINDOW_DAYS}) and seed only.`);

  const catalogues = await controlJson<{ items: Array<{ kind: string; surfaceKey: string; activation: unknown }> }>(
    '/api/v1/configuration/catalogues',
  );
  const active = catalogues?.items.find((item) => item.kind === 'INDUSTRY_PACK' && item.activation);
  if (!active) return problem(409, 'Activate an industry pack in this workspace first.');
  const current = await controlJson<{ manifest: { catalogue: IndustryPackV1 } }>(
    `/api/v1/configuration/catalogues/current?kind=INDUSTRY_PACK&surfaceKey=${encodeURIComponent(active.surfaceKey)}`,
  );
  if (!current) return problem(502, 'The active industry pack could not be read.');
  const pack = current.manifest.catalogue;
  const perDay = estimateDemoLabFacts(pack.demoProfile, 1);
  const days = Math.max(7, Math.min(options.days ?? 180, Math.floor(MAX_DEMO_LAB_FACTS / perDay), MAX_PLACE_ANALYTICS_WINDOW_DAYS));
  const body: DemoLabGenerateRequestV1 = {
    placeTypes: pack.placeTypes.slice(0, pack.demoProfile.zonesPerSite > 0 ? 3 : 2),
    demoProfile: pack.demoProfile,
    days,
    endDate: new Date().toISOString().slice(0, 10),
    seed: options.seed ?? 42,
  };
  return relay(await callSignedModule(analyticsModule, session, 'POST', ['v1', 'demo-lab', 'generate'], body, 120_000));
}

/** Purges the workspace's synthetic Analytics data, then deletes the Demo Lab tenant (platform roles only). */
async function remove(session: Session): Promise<NextResponse> {
  if (session.platformRoles.length === 0) return problem(403, 'Only platform administrators can delete a Demo Lab workspace.');
  const purged = await callSignedModule(analyticsModule, session, 'POST', ['v1', 'demo-lab', 'reset'], {}, 60_000);
  if (!purged.ok) return relay(purged);
  const response = await authenticatedUpstream('control', `/api/v1/platform/demo-lab/tenants/${encodeURIComponent(session.tenant!.id)}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Demo Lab workspace deleted by its platform administrator' }),
  });
  if (!response) return problem(401, 'Authentication required.');
  return relay(response);
}

async function controlJson<T>(path: string): Promise<T | null> {
  const response = await authenticatedUpstream('control', path);
  if (!response?.ok) return null;
  return (await response.json()) as T;
}

async function relay(response: Response): Promise<NextResponse> {
  const text = await response.text();
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
  });
}

function problem(status: number, title: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status, code: 'DEMO_LAB', correlationId: randomUUID() },
    { status, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' } },
  );
}
