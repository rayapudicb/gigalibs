import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../app/api/gigalibs-assistant/[...path]/route';

const verifiedSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/verified-session', () => ({ verifiedSession }));

const params = (path: string) => ({ params: Promise.resolve({ path: path.split('/') }) });
const activeContext = {
  tenant: {
    id: 'fictional-tenant', status: 'ACTIVE', features: ['gigalibs-assistant'],
    entitlements: [{ moduleKey: 'gigalibs-assistant', status: 'ENABLED', version: '1' }],
  },
  permissions: ['assistant:preview'],
};

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GIGALIBS_ASSISTANT_DEV_PREVIEW_ENABLED', 'true');
  verifiedSession.mockResolvedValue({ context: activeContext });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  verifiedSession.mockReset();
});

describe('WI-OI-121f Assistant request boundary', () => {
  it('requires a verified session for info', async () => {
    verifiedSession.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
    expect((await GET(new Request('http://localhost:5180/api/gigalibs-assistant/info'), params('info'))).status).toBe(401);
  });

  it('refuses vendor cloud keys after authorization', async () => {
    const result = await GET(new Request('http://localhost:5180/api/gigalibs-assistant/info', {
      headers: { 'x-copilotcloud-public-api-key': 'pk_test_rejected' },
    }), params('info'));
    expect(result.status).toBe(400);
    expect(await result.text()).toContain('Vendor keys are not accepted');
  });

  it('advertises only a synthetic local preview, never tool or history availability', async () => {
    const result = await GET(new Request('http://localhost:5180/api/gigalibs-assistant/info'), params('info'));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      mode: 'synthetic-local-preview', model: 'llama3.2', tools: false, history: false, persistence: false,
    });
  });

  it('denies a cross-origin request before calling Ollama', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await POST(new Request('http://localhost:5180/api/gigalibs-assistant/agent/default/run', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', host: 'localhost:5180', 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: 'fictional-pump' }),
    }), params('agent/default/run'));
    expect(result.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('denies real work-order prompts even when the member has a preview grant', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await POST(new Request('http://localhost:5180/api/gigalibs-assistant/agent/default/run', {
      method: 'POST',
      headers: { origin: 'http://localhost:5180', host: 'localhost:5180', 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Summarize live work orders' }] }),
    }), params('agent/default/run'));
    expect(result.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
