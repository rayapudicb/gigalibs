import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunsService } from './runs.service.js';
import type { DatabaseService } from '../database/database.service.js';

describe('RunsService (Workflow Runs & Ledger Verification)', () => {
  let runsService: RunsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    runsService = new RunsService(mockDb as unknown as DatabaseService);
  });

  it('rejects verifyLedger request missing tenantId', async () => {
    await expect(runsService.verifyLedger('')).rejects.toThrow('tenant_id is required');
  });

  it('returns VALID when ledger has no workflow runs', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await runsService.verifyLedger('tenant-corp-01');
    expect(result.valid).toBe(true);
    expect(result.state).toBe('VALID');
    expect(result.totalRecords).toBe(0);
  });

  it('returns UNSEALED when runs lack seal metadata', async () => {
    mockDb.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          id: 'run-1',
          tenant_id: 'tenant-corp-01',
          workflow_code: 'WF-1',
          version: '1.0.0',
          correlation_id: 'corr-1',
          status: 'COMPLETED',
          completed_at: new Date('2026-09-25T11:00:00Z'),
          seal_sequence: null,
          seal_hash: null,
          previous_seal_hash: null,
        },
      ],
    });

    const result = await runsService.verifyLedger('tenant-corp-01');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('UNSEALED');
  });

  it('fetches run details by ID and throws if not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(runsService.getRunById('tenant-1', 'non-existent')).rejects.toThrow(
      "Workflow run 'non-existent' not found",
    );
  });
});
