import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkforceDatabaseService } from '../database/database.service.js';
import { WorkforceResourcesService } from './workforce-resources.service.js';

const principal = {
  tenantId: 'tenant-a',
  subject: 'user-a',
  sessionId: 'session-a',
  authVersion: 1,
  permissions: ['workforce:*'],
  roles: ['MEMBER'],
  persona: 'OPERATIONS_SUPERVISOR' as const,
  orgScope: { mode: 'FLAT_TENANT' as const },
};

describe('WorkforceResourcesService', () => {
  let client: { query: ReturnType<typeof vi.fn> };
  let database: { withTenantTransaction: ReturnType<typeof vi.fn> };
  let service: WorkforceResourcesService;

  beforeEach(() => {
    client = { query: vi.fn() };
    database = {
      withTenantTransaction: vi.fn(async (tenantId: string, callback: (value: unknown) => unknown) => {
        expect(tenantId).toBe('tenant-a');
        return callback(client);
      }),
    };
    service = new WorkforceResourcesService(database as unknown as WorkforceDatabaseService);
  });

  it('returns a tenant-transaction-bound resource page without fallback records', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{
        id: '00000000-0000-4000-8000-000000000001',
        reference_code: 'TECH-01',
        display_name: 'Technician One',
        resource_type: 'HUMAN',
        platform_user_id: null,
        status: 'ACTIVE',
        version: 1,
        qualification_count: 2,
        total_count: 1,
        created_at: new Date('2026-09-26T00:00:00.000Z'),
        updated_at: new Date('2026-09-26T00:00:00.000Z'),
      }],
    });

    await expect(service.listResources(principal, { page: '1', pageSize: '25' })).resolves.toMatchObject({
      total: 1,
      items: [{ referenceCode: 'TECH-01', qualificationCount: 2 }],
    });
    expect(database.withTenantTransaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0]![1][0]).toBe('tenant-a');
  });

  it('writes capability, audit evidence and outbox fact in the same transaction', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{
        id: '00000000-0000-4000-8000-000000000002',
        code: 'FORKLIFT',
        name: 'Forklift operator',
        description: null,
        evidence_required: true,
        default_validity_days: 365,
        status: 'ACTIVE',
        version: 1,
        created_at: new Date('2026-09-26T00:00:00.000Z'),
        updated_at: new Date('2026-09-26T00:00:00.000Z'),
      }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await expect(service.createCapabilityDefinition(
      { principal, correlationId: 'correlation-1' },
      { code: 'forklift', name: 'Forklift operator', evidenceRequired: true, defaultValidityDays: 365 },
    )).resolves.toMatchObject({ code: 'FORKLIFT', evidenceRequired: true, assignedResourceCount: 0 });

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[1]![0]).toContain('audit_events');
    expect(client.query.mock.calls[2]![0]).toContain('outbox_events');
    expect(client.query.mock.calls[2]![1]).toContain('CAPABILITY_DEFINITION_CREATED_V1');
  });

  it('fails optimistic concurrency without writing audit or outbox evidence', async () => {
    client.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 4 }] });

    await expect(service.updateResource(
      { principal, correlationId: 'correlation-2' },
      '00000000-0000-4000-8000-000000000003',
      { expectedVersion: 3, displayName: 'Changed' },
    )).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
