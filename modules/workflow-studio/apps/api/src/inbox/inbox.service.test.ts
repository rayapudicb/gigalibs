import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowInboxService } from './inbox.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('WorkflowInboxService (Transactional Deduplication & Idempotency)', () => {
  let inboxService: WorkflowInboxService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };

    mockDb = {
      withTenantTransaction: vi.fn(async (tenantId: string, op: any) => {
        return op(mockClient);
      }),
    };

    inboxService = new WorkflowInboxService(mockDb as unknown as DatabaseService);
  });

  it('rejects events missing required routing parameters', async () => {
    await expect(
      inboxService.processEvent({
        tenantId: '',
        source: 'ar',
        eventId: 'evt-1',
        eventType: 'invoice.issued',
        payload: {},
      }),
    ).rejects.toThrow('tenantId, source, eventId, and eventType are required');

    await expect(
      inboxService.processEvent({
        tenantId: 'tenant-1',
        source: '',
        eventId: 'evt-1',
        eventType: 'invoice.issued',
        payload: {},
      }),
    ).rejects.toThrow('tenantId, source, eventId, and eventType are required');
  });

  it('processes a new event, sanitizes payload, and inserts into inbox_events', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT deduplication check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // INSERT inbox event

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'data-studio',
      eventId: 'evt-contract-999',
      eventType: 'contract.published',
      payload: {
        contract_code: 'CONTRACT-999',
        api_key: 'top-secret-key',
      },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(false);
    expect(result.eventId).toBe('evt-contract-999');

    const insertCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO gigalibs_workflow.inbox_events'),
    );
    expect(insertCall).toBeDefined();
    const payloadParam = insertCall[1][5];
    const parsedPayload = JSON.parse(payloadParam);
    expect(parsedPayload.api_key).toBe('[REDACTED]');
    expect(parsedPayload.contract_code).toBe('CONTRACT-999');
  });

  it('detects duplicate events and returns replayed: true without re-inserting', async () => {
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'inb-001', status: 'PROCESSED' }],
    }); // SELECT finds existing PROCESSED event

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'data-studio',
      eventId: 'evt-contract-999',
      eventType: 'contract.published',
      payload: { contract_code: 'CONTRACT-999' },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(true);
    expect(result.eventId).toBe('evt-contract-999');

    const insertCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO gigalibs_workflow.inbox_events'),
    );
    expect(insertCall).toBeUndefined();
  });
});
