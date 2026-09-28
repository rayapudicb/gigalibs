import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TimeEntriesService } from './time-entries.service.js';

describe('GigaOps TimeEntriesService', () => {
  let mockDb: any;
  let service: TimeEntriesService;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new TimeEntriesService(mockDb);
  });

  it('1. Submit blocked when agreement not SIGNED', async () => {
    // Role requires agreement
    mockDb.query.mockResolvedValueOnce({
      rows: [{ requires_agreement: true, role_id: 'role-1' }],
    });
    // No signed agreement found
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.create('tenant-1', {
        positionId: 'pos-1',
        workerId: 'worker-1',
        workUnitId: 'wu-1',
        workDate: '2026-10-01',
        clockedMinutes: 480,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('2. Submit >10 days sets is_prior_payroll to true', async () => {
    // Role does not require agreement
    mockDb.query.mockResolvedValueOnce({
      rows: [{ requires_agreement: false, role_id: 'role-1' }],
    });
    // Insert mock
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'te-1', is_prior_payroll: true, status: 'SUBMITTED' }],
    });

    const oldDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const entry = await service.create('tenant-1', {
      positionId: 'pos-1',
      workerId: 'worker-1',
      workUnitId: 'wu-1',
      workDate: oldDate,
    });

    expect(entry.is_prior_payroll).toBe(true);
  });

  it('3. 4th punch is rejected (maximum 3 allowed)', async () => {
    await expect(service.clockIn('tenant-1', 'te-1', 4)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('4. Approve changes status to APPROVED', async () => {
    // getById
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'te-1', tenant_id: 'tenant-1', status: 'SUBMITTED' }],
    });
    // punches
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // update
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'te-1', status: 'APPROVED' }],
    });

    const approved = await service.approve('tenant-1', 'te-1', 'approver-1');
    expect(approved.status).toBe('APPROVED');
  });

  it('5. Reject requires reason', async () => {
    await expect(
      service.reject('tenant-1', 'te-1', 'approver-1', ''),
    ).rejects.toThrow(BadRequestException);
  });
});
