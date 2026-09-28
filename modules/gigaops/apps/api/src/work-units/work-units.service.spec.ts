import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { WorkUnitsService } from './work-units.service.js';

describe('GigaOps WorkUnitsService', () => {
  let mockDb: any;
  let service: WorkUnitsService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new WorkUnitsService(mockDb);
  });

  it('1. Create returns id and draft status', async () => {
    const mockRow = {
      id: 'wu-101',
      tenant_id: 'tenant-1',
      name: 'Q3 Plant Shutdown',
      status: 'DRAFT',
      headcount_target: 10,
    };
    mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });

    const result = await service.create('tenant-1', {
      name: 'Q3 Plant Shutdown',
      startAt: '2026-10-01T08:00:00Z',
      endAt: '2026-10-01T17:00:00Z',
      industrySlug: 'manufacturing',
      headcountTarget: 10,
    });

    expect(result.id).toBe('wu-101');
    expect(result.status).toBe('DRAFT');
  });

  it('2. Activate changes status to ACTIVE', async () => {
    // getById returns DRAFT
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'wu-101', tenant_id: 'tenant-1', status: 'DRAFT' }],
    });
    // UPDATE returns ACTIVE
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'wu-101', tenant_id: 'tenant-1', status: 'ACTIVE' }],
    });

    const result = await service.activate('tenant-1', 'wu-101');
    expect(result.status).toBe('ACTIVE');
  });

  it('3. Close rejects if DRAFT', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'wu-101', tenant_id: 'tenant-1', status: 'DRAFT' }],
    });

    await expect(service.close('tenant-1', 'wu-101')).rejects.toThrow(BadRequestException);
  });

  it('4. Dashboard returns correct headcount and fill rate', async () => {
    // getById
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'wu-101', tenant_id: 'tenant-1', headcount_target: 10 }],
    });
    // positions
    mockDb.query.mockResolvedValueOnce({
      rows: [{ total_positions: '10', filled_positions: '8' }],
    });
    // time entries
    mockDb.query.mockResolvedValueOnce({
      rows: [{ total_entries: '8', approved_entries: '5', pending_entries: '3' }],
    });

    const dash = await service.getDashboard('tenant-1', 'wu-101');
    expect(dash.headcount.target).toBe(10);
    expect(dash.headcount.totalSlots).toBe(10);
    expect(dash.headcount.filled).toBe(8);
    expect(dash.headcount.fillRate).toBe(80);
    expect(dash.timeEntries.total).toBe(8);
    expect(dash.timeEntries.approved).toBe(5);
  });
});
