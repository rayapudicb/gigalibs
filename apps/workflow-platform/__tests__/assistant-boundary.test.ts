import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getAssistant, POST as postAssistant } from '../app/api/gigalibs-assistant/[...path]/route';
import { verifiedSession } from '../lib/verified-session';

vi.mock('../lib/verified-session', () => ({
  verifiedSession: vi.fn(),
}));

describe('GigaLibs Assistant BFF & Security Boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests containing vendor cloud public keys', async () => {
    const req = new Request('http://localhost:5180/api/gigalibs-assistant/info', {
      method: 'GET',
      headers: {
        'x-copilotcloud-public-api-key': 'pk_test_unauthorized',
      },
    });

    const res = await getAssistant(req, {
      params: Promise.resolve({ path: ['info'] }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('CopilotKit vendor keys are rejected');
  });

  it('serves valid info metadata with telemetry disabled and SSE mode', async () => {
    const req = new Request('http://localhost:5180/api/gigalibs-assistant/info', {
      method: 'GET',
    });

    const res = await getAssistant(req, {
      params: Promise.resolve({ path: ['info'] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('sse');
    expect(body.telemetryDisabled).toBe(true);
    expect(body.agents.default).toBeDefined();
    expect(body.agents.default.name).toBe('default');
  });

  it('denies cross-origin POST requests with HTTP 403', async () => {
    const req = new Request('http://localhost:5180/api/gigalibs-assistant/agent/default/run', {
      method: 'POST',
      headers: {
        origin: 'https://evil-attacker.example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });

    const res = await postAssistant(req, {
      params: Promise.resolve({ path: ['agent', 'default', 'run'] }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Cross-origin request rejected');
  });

  it('denies unauthenticated POST requests with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(verifiedSession).mockResolvedValue({
      response: NextResponse.json(
        { detail: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    } as any);

    const req = new Request('http://localhost:5180/api/gigalibs-assistant/agent/default/run', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'http://localhost:5180',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });

    const res = await postAssistant(req, {
      params: Promise.resolve({ path: ['agent', 'default', 'run'] }),
    });

    expect(res.status).toBe(401);
  });

  it('streams synthetic SSE events for authorized sessions', async () => {
    vi.mocked(verifiedSession).mockResolvedValue({
      response: null,
      context: {
        user: { id: 'usr-1', email: 'operator@gigalibs.com' },
        tenant: { id: 'tenant-acme', features: ['gigalibs-assistant'] },
        permissions: ['cmms:read'],
        platformRoles: [],
      },
    } as any);

    const req = new Request('http://localhost:5180/api/gigalibs-assistant/agent/default/run', {
      method: 'POST',
      headers: {
        host: 'localhost:5180',
        origin: 'http://localhost:5180',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        threadId: 'test-thread',
        runId: 'test-run-1',
        messages: [{ role: 'user', content: 'Summarize open work orders for Substation 4' }],
      }),
    });

    const res = await postAssistant(req, {
      params: Promise.resolve({ path: ['agent', 'default', 'run'] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let streamText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamText += decoder.decode(value);
    }

    expect(streamText).toContain('RUN_STARTED');
    expect(streamText).toContain('REASONING_CONTENT');
    expect(streamText).toContain('TEXT_MESSAGE_CONTENT');
    expect(streamText).toContain('WO-4892');
    expect(streamText).toContain('RUN_FINISHED');
  });
});
