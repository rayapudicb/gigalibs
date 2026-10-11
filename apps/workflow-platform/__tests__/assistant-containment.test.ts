import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { VerifiedSession } from '../lib/verified-session';

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/verified-session', () => ({ verifiedSession: sessionMock }));

import { canUseAssistantPreview } from '../lib/assistant-preview-access';
import { GET, POST } from '../app/api/gigalibs-assistant/[...path]/route';
import { GET as ALIAS_GET, POST as ALIAS_POST } from '../app/api/copilotkit/[...path]/route';
import { GET as HISTORY_GET } from '../app/api/assistant/history/route';

const context = {
  tenant: {
    id: 'tenant-a',
    name: 'Synthetic tenant',
    slug: 'synthetic-tenant',
    status: 'ACTIVE',
    trialEndsAt: null,
    features: ['gigalibs-assistant'],
    entitlements: [{ moduleKey: 'gigalibs-assistant', status: 'ENABLED' as const, version: '1' }],
  },
  permissions: ['assistant:preview'],
} satisfies Pick<VerifiedSession, 'tenant' | 'permissions'>;

const params = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });
const request = (body: unknown, origin = 'http://localhost:5180') =>
  new Request('http://localhost:5180/api/gigalibs-assistant/agent/default/run', {
    method: 'POST',
    headers: { origin, host: 'localhost:5180', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GIGALIBS_ASSISTANT_DEV_PREVIEW_ENABLED', 'true');
  sessionMock.mockResolvedValue({ context });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sessionMock.mockReset();
});

describe('Assistant fail-closed preview gate', () => {
  it('requires development, explicit opt-in, active tenant, feature, entitlement and exact preview grant', () => {
    expect(canUseAssistantPreview(context)).toBe(true);
    expect(canUseAssistantPreview(context, 'production', 'true')).toBe(false);
    expect(canUseAssistantPreview(context, 'development', 'false')).toBe(false);
    expect(canUseAssistantPreview({ ...context, tenant: null })).toBe(false);
    expect(canUseAssistantPreview({ ...context, tenant: { ...context.tenant, status: 'SUSPENDED' } })).toBe(false);
    expect(canUseAssistantPreview({ ...context, tenant: { ...context.tenant, features: [] } })).toBe(false);
    expect(canUseAssistantPreview({ ...context, tenant: { ...context.tenant, entitlements: [] } })).toBe(false);
    expect(canUseAssistantPreview({ ...context, permissions: ['*', 'assistant:*', 'assistant:read'] })).toBe(false);
  });

  it('denies unauthenticated, wrong-permission and production requests at the API and alias', async () => {
    sessionMock.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
    expect((await GET(new Request('http://localhost:5180/info'), params('info'))).status).toBe(401);
    sessionMock.mockResolvedValue({ context: { ...context, permissions: ['*', 'assistant:*'] } });
    expect((await ALIAS_GET(new Request('http://localhost:5180/info'), params('info'))).status).toBe(403);
    expect((await ALIAS_POST(request({ scenario: 'fictional-pump' }), params('agent/default/run'))).status).toBe(403);
    sessionMock.mockResolvedValue({ context });
    vi.stubEnv('NODE_ENV', 'production');
    expect((await GET(new Request('http://localhost:5180/info'), params('info'))).status).toBe(403);
    expect((await POST(request({ scenario: 'fictional-pump' }), params('agent/default/run'))).status).toBe(403);
  });

  it('refuses cross-origin calls, caller prompts and tool payloads before model access', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    expect((await POST(request({ scenario: 'fictional-pump' }, 'https://other.example'), params('agent/default/run'))).status).toBe(403);
    expect((await POST(request({ scenario: 'fictional-pump', messages: [{ content: 'customer data' }] }), params('agent/default/run'))).status).toBe(400);
    expect((await POST(request({ scenario: 'fictional-pump', tenantId: 'other-tenant' }), params('agent/default/run'))).status).toBe(400);
    expect((await POST(request({ scenario: 'fictional-pump', userId: 'other-user' }), params('agent/default/run'))).status).toBe(400);
    expect((await POST(request({ tool: 'cmms_create_work_order' }), params('agent/default/run'))).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('streams only the fixed fictional scenario from local llama3.2, without a fake tool result', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(
      'data: {"choices":[{"delta":{"content":"Inspect "}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"the bearings."}}]}\n\n' +
      'data: [DONE]\n\n',
      { status: 200 },
    ));
    vi.stubGlobal('fetch', upstream);
    const result = await POST(request({ scenario: 'fictional-pump' }), params('agent/default/run'));
    const stream = await result.text();
    expect(result.status).toBe(200);
    expect(stream).toContain('Inspect ');
    expect(stream).toContain('the bearings.');
    expect(stream).toContain('RUN_FINISHED');
    expect(stream).not.toContain('TOOL_CALL_RESULT');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toBe('http://127.0.0.1:11434/v1/chat/completions');
    const body = JSON.parse(upstream.mock.calls[0][1].body);
    expect(body.model).toBe('llama3.2');
    expect(JSON.stringify(body)).not.toContain('customer data');
    expect(JSON.stringify(body)).not.toContain('tenant-a');
  });

  it('fails visibly when Ollama is unavailable, rejects a response or returns no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const unavailable = await POST(request({ scenario: 'fictional-pump' }), params('agent/default/run'));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).toContain('no answer was generated');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('failed', { status: 503 })));
    expect((await POST(request({ scenario: 'fictional-pump' }), params('agent/default/run'))).status).toBe(503);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n')));
    const empty = await POST(request({ scenario: 'fictional-pump' }), params('agent/default/run'));
    const stream = await empty.text();
    expect(stream).toContain('RUN_ERROR');
    expect(stream).not.toContain('RUN_FINISHED');
  });

  it('never returns tenant-wide history, even to a preview-authorized user', async () => {
    expect((await HISTORY_GET()).status).toBe(410);
    sessionMock.mockResolvedValue({ context: { ...context, permissions: ['assistant:read'] } });
    expect((await HISTORY_GET()).status).toBe(403);
  });

  it('keeps former false-success UI and proof provider out of the active entry points', () => {
    const page = readFileSync(resolve(__dirname, '../app/(app)/assistant/page.tsx'), 'utf8');
    const launcher = readFileSync(resolve(__dirname, '../components/assistant/AssistantLauncher.tsx'), 'utf8');
    const modulesPage = readFileSync(resolve(__dirname, '../app/(app)/modules/page.tsx'), 'utf8');
    expect(page).not.toContain('GigaLibsCopilotKitProvider');
    expect(page).not.toContain('DailyInspectionChecklistCard');
    expect(launcher).not.toContain('GigaLibsAssistantDrawer');
    expect(modulesPage).toContain("module.key !== 'gigalibs-assistant' || canUseAssistantPreview(context)");
  });

  it('refuses the former blanket-grant script without opening a database connection', () => {
    const script = resolve(__dirname, '../../../scripts/enable-all-features.mjs');
    const source = readFileSync(script, 'utf8');
    expect(source).not.toContain('pg.Client');
    expect(source).not.toContain('UPDATE tenant_members');
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 3_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REFUSED');
  });
});
