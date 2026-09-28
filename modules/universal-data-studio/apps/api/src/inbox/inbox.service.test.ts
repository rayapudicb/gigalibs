import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InboxService } from './inbox.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('InboxService (Transactional Deduplication & Idempotency)', () => {
  let inboxService: InboxService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    mockDb = {
      getClient: vi.fn().mockResolvedValue(mockClient),
    };

    inboxService = new InboxService(mockDb as unknown as DatabaseService);
  });

  it('rejects input missing mandatory routing headers', async () => {
    await expect(
      inboxService.processEvent({
        tenantId: '',
        source: 'cmms',
        eventId: 'evt-1',
        eventType: 'work_order.completed',
        payload: {},
      }),
    ).rejects.toThrow('tenantId, source, eventId, and eventType are required');

    await expect(
      inboxService.processEvent({
        tenantId: 'tenant-1',
        source: '',
        eventId: 'evt-1',
        eventType: 'work_order.completed',
        payload: {},
      }),
    ).rejects.toThrow('tenantId, source, eventId, and eventType are required');
  });

  it('processes a new event, redacting sensitive fields and committing transaction', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT deduplication check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // INSERT inbox event
      .mockResolvedValueOnce({}); // COMMIT

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'stripe',
      eventId: 'evt-charge-100',
      eventType: 'payment.succeeded',
      payload: {
        amount: 25000,
        currency: 'USD',
        api_token: 'secret-tok',
      },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(false);
    expect(result.eventId).toBe('evt-charge-100');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();

    // Verify sanitized payload was inserted
    const insertCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO gigalibs_data_studio.inbox_events'),
    );
    expect(insertCall).toBeDefined();
    const payloadParam = insertCall[1][5];
    const parsedPayload = JSON.parse(payloadParam);
    expect(parsedPayload.api_token).toBe('[REDACTED]');
    expect(parsedPayload.amount).toBe(25000);
  });

  it('detects duplicate events and short-circuits with replayed: true', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'inb-001', status: 'PROCESSED' }],
      }) // SELECT returns existing PROCESSED
      .mockResolvedValueOnce({}); // COMMIT

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'stripe',
      eventId: 'evt-charge-100',
      eventType: 'payment.succeeded',
      payload: { amount: 25000 },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(true);
    expect(result.eventId).toBe('evt-charge-100');

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    // Ensure no INSERT was executed
    const insertCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO gigalibs_data_studio.inbox_events'),
    );
    expect(insertCall).toBeUndefined();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('rolls back transaction and releases client on unexpected database errors', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('Connection terminated unexpectedly')); // SELECT throws

    await expect(
      inboxService.processEvent({
        tenantId: 'tenant-corp-01',
        source: 'stripe',
        eventId: 'evt-error',
        eventType: 'payment.failed',
        payload: {},
      }),
    ).rejects.toThrow('Failed to process inbox event: Connection terminated unexpectedly');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
