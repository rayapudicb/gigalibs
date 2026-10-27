import {
  authenticatedUpstream,
  authenticationRequired,
  readBoundedBody,
  unavailable,
} from '@/lib/authenticated-upstream';
import { createCompanionModelClient } from '@/lib/companion/model-client';
import { runCompanionSession } from '@/lib/companion/session';
import {
  type CompanionHttpCaller,
  createCompanionToolExecutor,
} from '@/lib/companion/tool-executor';
import { verifiedSession } from '@/lib/verified-session';

// WI-OI-120bc (Giga AI Companion): the session route. It runs as the signed-in user — their permissions scope which
// tools are offered, and every tool call is proxied with their token via authenticatedUpstream, so the Companion can
// never exceed what the person could do by hand. The model is the LOCAL Ollama (no cloud key); if OLLAMA_HOST is unset
// the llm-inference helper throws LlmProviderUnavailableError and this returns 503 (unavailable), never a fake answer.

export async function POST(request: Request): Promise<Response> {
  const result = await verifiedSession();
  if (!result.context) return result.response;
  const session = result.context;

  let goal = '';
  try {
    goal = String((JSON.parse(await readBoundedBody(request)) as { goal?: unknown }).goal ?? '');
  } catch {
    goal = '';
  }
  if (goal.trim().length === 0) {
    return Response.json({ detail: 'A goal is required.' }, { status: 400 });
  }

  const caller: CompanionHttpCaller = async (method, path, init) => {
    const query = init?.query
      ? Object.entries(init.query)
          .filter((entry): entry is [string, string] => entry[1] !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : '';
    const full = query ? `${path}?${query}` : path;
    const res = await authenticatedUpstream('control', full, {
      method,
      ...(init?.body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
        : {}),
    });
    if (!res) return { ok: false, status: 401, data: null };
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  };

  try {
    const run = await runCompanionSession({
      goal,
      heldPermissions: session.permissions,
      createdBy: session.user.id,
      model: createCompanionModelClient(),
      executor: createCompanionToolExecutor(caller),
      maxTurns: 10,
    });
    return Response.json(
      {
        outcome: run.outcome,
        panels: run.panels,
        campaign: run.campaign,
        question: run.question,
        navigateTo: run.navigateTo,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return unavailable(error);
  }
}

export function GET(): Response {
  return authenticationRequired();
}
