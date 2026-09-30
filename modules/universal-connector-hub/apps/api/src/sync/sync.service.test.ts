import { generateKeyPairSync } from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from './sync.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('SyncService (CN-03 Checkpointing & Ingestion)', () => {
  let syncService: SyncService;
  let mockDb: any;

  beforeEach(() => {
    process.env.CONNECTOR_HUB_API_HOST = '127.0.0.1';
    process.env.CONNECTOR_HUB_API_PORT = '4100';
    process.env.CONNECTOR_HUB_CORS_ORIGINS = 'http://localhost:5180';
    process.env.CONNECTORS_DATABASE_URL =
      'postgresql://connectors_runtime:secret@localhost:5440/gigalibs';
    process.env.CONNECTOR_HUB_DATABASE_POOL_SIZE = '10';
    process.env.CONNECTOR_VAULT_KEY = 'local-test-key-that-is-at-least-32-bytes-long';
    process.env.CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION = '5';
    process.env.CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64 = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    process.env.CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS = 'api.spend.internal';
    process.env.CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND = 'false';
    const query = vi.fn();
    mockDb = {
      query,
      queryWithTenant: query,
    };
    syncService = new SyncService(mockDb as unknown as DatabaseService);
  });

  const mockConnection = {
    id: 'conn-coupa-01',
    tenant_id: 'tenant-corp-01',
    connector_code: 'COUPA_PROCUREMENT',
    name: 'Coupa Spend Pipeline',
    slug: 'coupa-procure',
    status: 'READY',
    configuration: {},
  };

  it('rejects triggerSync when tenantId is empty', async () => {
    await expect(syncService.triggerSync('', 'conn-1')).rejects.toThrow('tenantId is required');
  });

  it('executes real batch delta sync, ingests records into journal, and advances checkpoint cursor', async () => {
    const sourceRecords = [
      { id: 'REQ-101', version: 1, data: { po_number: 'PO-991', amount: 12500 } },
      { id: 'REQ-102', version: 1, data: { po_number: 'PO-992', amount: 8400 } },
    ];

    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockConnection] }) // find connection
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // last sync checkpoint
      // Record 1 dup check + insert
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      // Record 2 dup check + insert
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      // Insert sync_jobs checkpoint
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      // Update tenant_connections events_count
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await syncService.triggerSync('tenant-corp-01', 'conn-coupa-01', {
      source_records: sourceRecords,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.records_synced).toBe(2);
    expect(result.duplicates_skipped).toBe(0);
    expect(result.cursor_after).toBeDefined();

    // Verify sync_jobs was inserted with real count = 2
    const syncJobCall = mockDb.query.mock.calls.find((c: any[]) =>
      c.some(
        (value: unknown) =>
          typeof value === 'string' && value.includes('INSERT INTO gigalibs_connectors.sync_jobs'),
      ),
    );
    expect(syncJobCall).toBeDefined();
    expect(syncJobCall[2][3]).toBe(2); // records_ingested = 2
  });

  it('skips duplicate records during delta sync and reports correct ingested count', async () => {
    const sourceRecords = [
      { id: 'REQ-DUP', version: 1, data: { po_number: 'PO-DUP', amount: 1000 } },
      { id: 'REQ-NEW', version: 1, data: { po_number: 'PO-NEW', amount: 2000 } },
    ];

    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockConnection] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ cursor_after: '2026-09-01T00:00:00Z' }] })
      // Record 1 dup check: returns existing row (DUPLICATE)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'ing-prior-1' }] })
      // Record 2 dup check: new record
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert record 2
      // Checkpoint commit
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await syncService.triggerSync('tenant-corp-01', 'conn-coupa-01', {
      source_records: sourceRecords,
    });

    expect(result.records_synced).toBe(1);
    expect(result.duplicates_skipped).toBe(1);
  });

  it('queries remote endpoint with cursor watermark when configured', async () => {
    const connWithUrl = {
      ...mockConnection,
      configuration: { sync_endpoint: 'https://api.spend.internal/v1/records' },
    };

    mockDb.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [connWithUrl] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ cursor_after: '2026-09-10T00:00:00Z' }] })
      // Remote fetch returns 1 record
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // dup check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // sync_jobs
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // stats update

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{ id: 'REMOTE-01', version: 2, name: 'Remote Item' }],
      }),
    } as any);

    try {
      const result = await syncService.triggerSync('tenant-corp-01', 'conn-coupa-01');
      expect(result.success).toBe(true);
      expect(result.records_synced).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('since=2026-09-10T00%3A00%3A00Z'),
        expect.anything(),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('aggregates real stats directly from database tables', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ total_connections: 5, ready_connections: 4, total_events_processed: 1200 }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ journal_count: 1200, avg_latency_ms: 12, dispatched_count: 1180 }],
      });

    const stats = await syncService.getStats('tenant-corp-01');
    expect(stats.total_connections).toBe(5);
    expect(stats.ready_connections).toBe(4);
    expect(stats.total_events_processed).toBe(1200);
    expect(stats.journal_entries).toBe(1200);
    expect(stats.dispatched_to_workflows).toBe(1180);
    expect(stats.avg_latency_ms).toBe(12);
  });
});
