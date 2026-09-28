import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaxInboxService } from './inbox.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('TaxInboxService (Transactional Tax Event Deduplication)', () => {
  let inboxService: TaxInboxService;
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

    inboxService = new TaxInboxService(mockDb as unknown as DatabaseService);
  });

  it('rejects input missing mandatory routing headers', async () => {
    await expect(
      inboxService.processEvent({
        tenantId: '',
        source: 'ar-engine',
        eventId: 'tax-evt-1',
        eventType: 'invoice.finalized',
        payload: {},
      }),
    ).rejects.toThrow('tenantId, source, eventId, and eventType are required');
  });

  it('processes new tax event and commits sanitized payload', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT deduplication check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // INSERT inbox event

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'accounts-receivable',
      eventId: 'inv-tax-999',
      eventType: 'invoice.tax_requested',
      payload: {
        documentId: 'inv-999',
        jurisdictionCode: 'US-CA',
        tax_id: '99-8877665',
      },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(false);
    expect(result.eventId).toBe('inv-tax-999');

    const insertCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO gigalibs_tax.inbox_events'),
    );
    expect(insertCall).toBeDefined();
    const payloadParam = insertCall[1][5];
    const parsedPayload = JSON.parse(payloadParam);
    expect(parsedPayload.tax_id).toBe('[REDACTED]');
    expect(parsedPayload.documentId).toBe('inv-999');
  });

  it('detects duplicate events and short-circuits with replayed: true', async () => {
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'inb-001', status: 'PROCESSED' }],
    }); // SELECT returns existing PROCESSED

    const result = await inboxService.processEvent({
      tenantId: 'tenant-corp-01',
      source: 'accounts-receivable',
      eventId: 'inv-tax-999',
      eventType: 'invoice.tax_requested',
      payload: { documentId: 'inv-999' },
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.replayed).toBe(true);
  });
});
