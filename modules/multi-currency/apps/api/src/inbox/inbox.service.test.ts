import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurrencyInboxService } from './inbox.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('CurrencyInboxService (Transactional FX Event Deduplication)', () => {
  let inboxService: CurrencyInboxService;
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

    inboxService = new CurrencyInboxService(mockDb as unknown as DatabaseService);
  });

  it('rejects input missing mandatory routing headers', async () => {
    await expect(
      inboxService.processEvent({
        tenantId: '',
        source: 'reuters',
        eventId: 'fx-evt-1',
        eventType: 'rate.updated',
        payload: {},
      }),
    ).rejects.toThrow('tenantId, source, eventId, and eventType are required');
  });

  it('processes new rate update event and commits sanitized payload', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT deduplication check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // INSERT inbox event

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'bloomberg',
      eventId: 'fx-rate-999',
      eventType: 'rate.published',
      payload: {
        pair: 'EUR/USD',
        rate: 1.085,
        api_key: 'bloomberg-secret',
      },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(false);
    expect(result.eventId).toBe('fx-rate-999');

    const insertCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO gigalibs_currency.inbox_events'),
    );
    expect(insertCall).toBeDefined();
    const payloadParam = insertCall[1][5];
    const parsedPayload = JSON.parse(payloadParam);
    expect(parsedPayload.api_key).toBe('[REDACTED]');
    expect(parsedPayload.pair).toBe('EUR/USD');
  });

  it('detects duplicate events and short-circuits with replayed: true', async () => {
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'inb-001', status: 'PROCESSED' }],
    }); // SELECT returns existing PROCESSED

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'bloomberg',
      eventId: 'fx-rate-999',
      eventType: 'rate.published',
      payload: { pair: 'EUR/USD' },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(true);
  });
});
