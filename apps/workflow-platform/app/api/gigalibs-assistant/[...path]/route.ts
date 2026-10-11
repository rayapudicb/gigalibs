import { randomUUID } from 'node:crypto';
import { canUseAssistantPreview } from '@/lib/assistant-preview-access';
import { hasSameOrigin } from '@/lib/same-origin';
import { verifiedSession } from '@/lib/verified-session';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ path: string[] }> };
const OLLAMA_URL = 'http://127.0.0.1:11434/v1/chat/completions';
const MODEL = 'llama3.2';

function json(error: string, status: number): Response {
  return Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
}

async function authorize(): Promise<Response | null> {
  const session = await verifiedSession(false);
  if (session.response) return session.response;
  if (!canUseAssistantPreview(session.context)) return json('Assistant preview is unavailable', 403);
  return null;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const denial = await authorize();
  if (denial) return denial;
  if (request.headers.has('x-copilotcloud-public-api-key')) return json('Vendor keys are not accepted', 400);
  if ((await context.params).path.join('/') !== 'info') return json('Endpoint not found', 404);
  return Response.json(
    { mode: 'synthetic-local-preview', model: MODEL, tools: false, history: false, persistence: false },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/** Only a fixed, fictional scenario is accepted. No caller prompt, context or business records cross this boundary. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!hasSameOrigin(request)) return json('Cross-origin request rejected', 403);
  const denial = await authorize();
  if (denial) return denial;
  if (request.headers.has('x-copilotcloud-public-api-key')) return json('Vendor keys are not accepted', 400);
  if ((await context.params).path.join('/') !== 'agent/default/run') return json('Endpoint not found', 404);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json('JSON required', 415);

  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 128) return json('Request too large', 413);
    payload = JSON.parse(body);
  } catch {
    return json('Invalid JSON request', 400);
  }
  if (
    !payload || typeof payload !== 'object' || Array.isArray(payload) ||
    Object.keys(payload).length !== 1 ||
    !('scenario' in payload) || payload.scenario !== 'fictional-pump'
  ) return json('Only the fixed synthetic scenario is available', 400);

  let upstream: Response;
  try {
    upstream = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0,
        max_tokens: 256,
        messages: [
          { role: 'system', content: 'This is a fictional model connectivity test, not GigaLibs business data. Do not claim access to records, tools, sensors or completed actions. Answer concisely.' },
          { role: 'user', content: 'In a fictional example, a pump shows vibration of 4.2 mm/s. Explain one possible inspection step. Do not claim any inspection was performed.' },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch {
    return json('Local model unavailable or timed out; no answer was generated', 503);
  }
  if (!upstream.ok || !upstream.body) {
    upstream.body?.cancel().catch(() => undefined);
    return json('Local model unavailable; no answer was generated', 503);
  }

  const runId = randomUUID();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = '';
      let contentSeen = false;
      let length = 0;
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const consumeLine = (line: string) => {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') return;
        let event: unknown;
        try { event = JSON.parse(line.slice(6)); } catch { return; }
        const delta = (event as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content;
        if (typeof delta !== 'string' || !delta) return;
        length += delta.length;
        if (length > 8_192) throw new Error('Model response exceeded preview limit');
        contentSeen = true;
        emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: runId, delta });
      };

      emit({ type: 'RUN_STARTED', runId, threadId: 'synthetic-preview' });
      emit({ type: 'TEXT_MESSAGE_START', messageId: runId, role: 'assistant' });
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) consumeLine(line.trim());
        }
        if (buffer.trim()) consumeLine(buffer.trim());
        if (!contentSeen) throw new Error('Empty model response');
        emit({ type: 'TEXT_MESSAGE_END', messageId: runId });
        emit({ type: 'RUN_FINISHED', runId, threadId: 'synthetic-preview' });
      } catch {
        emit({ type: 'RUN_ERROR', runId, message: 'Local model stream failed; the response is incomplete' });
        await reader.cancel().catch(() => undefined);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-content-type-options': 'nosniff',
    },
  });
}
