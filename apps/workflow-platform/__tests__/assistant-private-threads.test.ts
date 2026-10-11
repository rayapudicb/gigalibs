import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedSession } from '../lib/verified-session';

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/verified-session', () => ({ verifiedSession: sessionMock }));

const queryRawUnsafe = vi.hoisted(() => vi.fn());
const executeRawUnsafe = vi.hoisted(() => vi.fn());
vi.mock('@gigalibs/db', () => ({
  prisma: {
    $queryRawUnsafe: queryRawUnsafe,
    $executeRawUnsafe: executeRawUnsafe,
  },
}));

const callSignedModule = vi.hoisted(() => vi.fn());
vi.mock('@/lib/signed-module-proxy', () => ({ callSignedModule }));

import { GET as THREADS_GET, POST as THREADS_POST } from '../app/api/assistant/threads/route';
import { GET as THREAD_GET } from '../app/api/assistant/threads/[threadId]/route';
import { GET as MSGS_GET, POST as MSGS_POST } from '../app/api/assistant/threads/[threadId]/messages/route';
import { GET as POLICY_GET, POST as POLICY_POST } from '../app/api/assistant/policy/route';

const mockContext = {
  tenant: {
    id: 'tenant-alpha',
    name: 'Tenant Alpha',
    slug: 'tenant-alpha',
    status: 'ACTIVE',
    trialEndsAt: null,
    features: ['gigalibs-assistant'],
    entitlements: [{ moduleKey: 'gigalibs-assistant', status: 'ENABLED' as const, version: '1' }],
  },
  user: {
    id: 'user-001',
    email: 'operator@tenant-alpha.test',
  },
  permissions: ['assistant:read', 'assistant:action'],
} as unknown as VerifiedSession;

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ context: mockContext });
});

describe('Assistant Private Threads & Governance API', () => {
  describe('Policy Gating (Phase 3)', () => {
    it('returns 401 when session is not authenticated', async () => {
      sessionMock.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
      const res = await THREADS_GET();
      expect(res.status).toBe(401);
    });

    it('fails closed with HTTP 503 when tenant has no published policy', async () => {
      queryRawUnsafe.mockResolvedValueOnce([]); // no tenant_policies row
      const res = await THREADS_GET();
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain('published tenant policy');
    });

    it('returns published policy via policy GET route', async () => {
      queryRawUnsafe.mockResolvedValueOnce([
        {
          tenant_id: 'tenant-alpha',
          source_manifest_version: 'v1',
          source_checksum: '0'.repeat(64),
          retention_days: 30,
          status: 'PUBLISHED',
          published_at: new Date(),
        },
      ]);
      const res = await POLICY_GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.policy.retention_days).toBe(30);
    });

    it('publishes and projects policy via policy POST route', async () => {
      executeRawUnsafe.mockResolvedValueOnce(1);
      const req = new Request('http://localhost:5180/api/assistant/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionDays: 45, enabled: true }),
      });
      const res = await POLICY_POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.policy.retentionDays).toBe(45);
      expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });

  describe('Thread Isolation & Ownership (Phase 4)', () => {
    it('creates a private thread scoped to tenant_id and owner_user_id', async () => {
      // 1. Policy check returns published policy
      queryRawUnsafe.mockResolvedValueOnce([
        {
          source_manifest_version: 'v1',
          source_checksum: '0'.repeat(64),
          retention_days: 30,
        },
      ]);
      // 2. Thread insertion
      executeRawUnsafe.mockResolvedValueOnce(1);
      // 3. Thread retrieval
      queryRawUnsafe.mockResolvedValueOnce([
        {
          id: '11111111-1111-1111-1111-111111111111',
          tenant_id: 'tenant-alpha',
          owner_user_id: 'user-001',
          title: 'Slurry Pump Bearing Diagnosis',
          version: 1,
          policy_version: 'v1',
          expires_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const req = new Request('http://localhost:5180/api/assistant/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Slurry Pump Bearing Diagnosis' }),
      });
      const res = await THREADS_POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.title).toBe('Slurry Pump Bearing Diagnosis');
      expect(data.id).toBe('11111111-1111-1111-1111-111111111111');

      expect(executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gigalibs_assistant.assistant_threads'),
        expect.any(String),
        'tenant-alpha',
        'user-001',
        'Slurry Pump Bearing Diagnosis',
        expect.any(String),
        expect.any(String),
        'v1',
        '0'.repeat(64),
        30
      );
    });

    it('returns 404 when reading an unowned thread (denies guessed IDs across tenants)', async () => {
      queryRawUnsafe.mockResolvedValueOnce([]); // no matching thread
      const res = await THREAD_GET(new Request('http://localhost:5180'), {
        params: Promise.resolve({ threadId: '11111111-1111-1111-1111-111111111111' }),
      });
      expect(res.status).toBe(404);
    });

    it('returns thread details when owned by the caller', async () => {
      queryRawUnsafe.mockResolvedValueOnce([
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Pump Investigation',
          version: 1,
          policy_version: 'v1',
          expires_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);
      const res = await THREAD_GET(new Request('http://localhost:5180'), {
        params: Promise.resolve({ threadId: '11111111-1111-1111-1111-111111111111' }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.thread.title).toBe('Pump Investigation');
    });
  });

  describe('Message Persistence, Runs, Audit & CMMS Tool (Phases 5, 6, 7)', () => {
    const threadId = '22222222-2222-2222-2222-222222222222';

    it('lists message history for owned thread', async () => {
      // 1. Thread check
      queryRawUnsafe.mockResolvedValueOnce([{ id: threadId }]);
      // 2. Message query
      queryRawUnsafe.mockResolvedValueOnce([
        {
          id: 'msg-1',
          thread_id: threadId,
          role: 'USER',
          content: 'Hello assistant',
          created_at: new Date(),
        },
      ]);
      const res = await MSGS_GET(new Request('http://localhost:5180'), {
        params: Promise.resolve({ threadId }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].content).toBe('Hello assistant');
    });

    it('executes real CMMS Work Order tool with live citations and persists run + audit trail', async () => {
      // 1. Thread verification check returns owner match
      queryRawUnsafe.mockResolvedValueOnce([{ id: threadId }]);

      // 2. Mock live CMMS response via callSignedModule
      callSignedModule.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'wo-101',
                workOrderNumber: 'WO-2026-0042',
                title: 'High vibration inspection on pump P-101',
                status: 'IN_PROGRESS',
                priority: 'HIGH',
                assetName: 'Centrifugal Pump #1',
                dueDate: '2026-10-15T12:00:00Z',
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      // 3. Mock database executions: assistant_runs, user message, assistant message, audit_events
      executeRawUnsafe.mockResolvedValue(1);

      const req = new Request(`http://localhost:5180/api/assistant/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Show me my assigned work orders' }),
      });

      const res = await MSGS_POST(req, {
        params: Promise.resolve({ threadId }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.role).toBe('ASSISTANT');
      expect(data.content).toContain('WO-2026-0042');
      expect(data.content).toContain('/cmms/work-orders');
      expect(data.runId).toBeDefined();

      // Verify CMMS module call was invoked with strict paging
      expect(callSignedModule).toHaveBeenCalledWith(
        expect.anything(),
        mockContext,
        'POST',
        ['v1', 'work-orders', 'search'],
        { page: 1, pageSize: 5 },
        4000
      );

      // Verify assistant_runs recorded
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gigalibs_assistant.assistant_runs'),
        expect.any(String),
        'tenant-alpha',
        threadId,
        'user-001',
        expect.stringContaining('run_'),
        expect.any(String),
        'MODULE_GATEWAY',
        'physical-operations-cmms'
      );

      // Verify audit_events recorded
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO gigalibs_assistant.audit_events'),
        expect.any(String),
        'tenant-alpha',
        'user-001',
        threadId,
        'TOOL_QUERY_CMMS_WORK_ORDERS',
        expect.any(String)
      );
    });
  });
});
