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

// WI-OI-120n (security review): a person's login link decides whose time is punched and whose week is submitted, so
// only holders of workforce.resources.link (administrators, through workforce:*) set or change it, and every change
// is audited with the link before and after.
describe('WorkforceResourcesService login links', () => {
  const manager = { ...principal, subject: 'manager-1', permissions: ['workforce.resources.read', 'workforce.resources.manage'] };
  const resourceId = '00000000-0000-4000-8000-000000000009';
  const detailRow = {
    id: resourceId,
    reference_code: 'TECH-09',
    display_name: 'Technician Nine',
    resource_type: 'HUMAN',
    platform_user_id: 'user-new',
    status: 'ACTIVE',
    version: 3,
    created_at: new Date('2026-10-06T00:00:00.000Z'),
    updated_at: new Date('2026-10-06T00:00:00.000Z'),
  };

  function harness() {
    const client = { query: vi.fn() };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, callback: (value: unknown) => unknown) => callback(client)) };
    return { client, database, service: new WorkforceResourcesService(database as unknown as WorkforceDatabaseService) };
  }

  it('refuses a manager who links a new person to a login', async () => {
    const { database, service } = harness();
    await expect(
      service.createResource({ principal: manager, correlationId: 'c-1' } as never, { referenceCode: 'TECH-10', displayName: 'Ten', resourceType: 'HUMAN', platformUserId: 'manager-1' }),
    ).rejects.toMatchObject({ response: { code: 'WORKFORCE_LINK_FORBIDDEN' } });
    expect(database.withTenantTransaction).not.toHaveBeenCalled();
  });

  it("refuses a manager who re-points or clears someone's link", async () => {
    const { database, service } = harness();
    for (const platformUserId of ['manager-1', null]) {
      await expect(
        service.updateResource({ principal: manager, correlationId: 'c-2' } as never, resourceId, { expectedVersion: 2, platformUserId }),
      ).rejects.toMatchObject({ response: { code: 'WORKFORCE_LINK_FORBIDDEN' } });
    }
    expect(database.withTenantTransaction).not.toHaveBeenCalled();
  });

  it('lets a manager rename a person without touching the link', async () => {
    const { client, service } = harness();
    client.query.mockImplementation(async (sql: string) => {
      if (/^\s*UPDATE/.test(sql)) return { rowCount: 1, rows: [{ version: 3 }] };
      if (/INSERT/.test(sql)) return { rowCount: 1, rows: [] };
      if (/FOR UPDATE/.test(sql)) throw new Error('the link is not read when it does not change');
      // The person's qualifications (no COUNT); the person row itself carries a qualification count.
      if (/resource_capabilities rc/.test(sql) && !/COUNT\(/.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [detailRow] };
    });
    await service.updateResource({ principal: manager, correlationId: 'c-3' } as never, resourceId, { expectedVersion: 2, displayName: 'Technician 9' });
    const audit = client.query.mock.calls.find(([sql]) => /audit_events/.test(sql as string))!;
    expect(JSON.parse(audit[1][7] as string)).not.toHaveProperty('platformUserId');
  });

  it('audits the link before and after when an administrator changes it', async () => {
    const { client, service } = harness();
    client.query.mockImplementation(async (sql: string) => {
      if (/FOR UPDATE/.test(sql)) return { rowCount: 1, rows: [{ platform_user_id: 'user-old' }] };
      if (/^\s*UPDATE/.test(sql)) return { rowCount: 1, rows: [{ version: 3 }] };
      if (/INSERT/.test(sql)) return { rowCount: 1, rows: [] };
      if (/resource_capabilities rc/.test(sql) && !/COUNT\(/.test(sql)) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [detailRow] };
    });
    await service.updateResource({ principal, correlationId: 'c-4' } as never, resourceId, { expectedVersion: 2, platformUserId: 'user-new' });
    const audit = client.query.mock.calls.find(([sql]) => /audit_events/.test(sql as string))!;
    expect(JSON.parse(audit[1][7] as string)).toMatchObject({ platformUserId: { before: 'user-old', after: 'user-new' } });
  });
});

// WI-OI-120u security review L3 (owner, L3a): someone else records your qualifications, or a supervisor could qualify
// themselves for work and pass the booking check.
describe('WorkforceResourcesService own qualifications', () => {
  const supervisor = { ...principal, subject: 'supervisor-1', permissions: ['workforce.capabilities.manage'] };
  const resourceId = '00000000-0000-4000-8000-000000000011';
  const assignment = { capabilityDefinitionId: '00000000-0000-4000-8000-000000000021', validFrom: '2026-10-13T00:00:00.000Z' };

  function harness(linkedTo: string | null) {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT platform_user_id FROM gigalibs_workforce\.workforce_resources/.test(sql)) return { rowCount: 1, rows: [{ platform_user_id: linkedTo }] };
        throw new Error(`past the check: ${sql.slice(0, 60)}`);
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, callback: (value: unknown) => unknown) => callback(client)) };
    return new WorkforceResourcesService(database as unknown as WorkforceDatabaseService);
  }

  it('refuses a qualification for the person linked to your own login', async () => {
    await expect(harness('supervisor-1').assignCapability({ principal: supervisor, correlationId: 'c' } as never, resourceId, assignment)).rejects.toMatchObject({
      response: { code: 'WORKFORCE_FOUR_EYES' },
    });
  });

  it("goes past the check for someone else's person, or one with no login", async () => {
    for (const linkedTo of ['technician-1', null]) {
      await expect(harness(linkedTo).assignCapability({ principal: supervisor, correlationId: 'c' } as never, resourceId, assignment)).rejects.toThrow(/past the check/);
    }
  });
});
