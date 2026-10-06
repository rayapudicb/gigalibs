import { describe, expect, it, vi } from 'vitest';
import type { WorkforceDatabaseService } from '../database/database.service.js';
import { AvailabilityService } from './availability.service.js';

// WI-OI-120n (security review): nobody decides an absence of their own person, even when someone else requested it.
describe('absence decisions', () => {
  const approver = {
    tenantId: 'tenant-a',
    subject: 'planner-1',
    sessionId: 's',
    authVersion: 1,
    permissions: ['workforce.absences.approve'],
    roles: ['MEMBER'],
    persona: 'OPERATIONS_SUPERVISOR' as const,
    orgScope: { mode: 'FLAT_TENANT' as const },
    spatialScope: { mode: 'UNBOUNDED' as const },
  };
  const absenceId = '00000000-0000-4000-8000-0000000000a1';

  function service(personLinkedTo: string | null) {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/FROM gigalibs_workforce\.absences/.test(sql)) {
          return { rows: [{ id: absenceId, resource_id: '00000000-0000-4000-8000-0000000000b1', status: 'REQUESTED', requested_by: 'someone-else', version: 1 }] };
        }
        if (/FROM gigalibs_workforce\.workforce_resources/.test(sql)) return { rows: [{ platform_user_id: personLinkedTo }] };
        throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
      }),
    };
    const database = { withTenantTransaction: vi.fn(async (_tenant: string, callback: (value: unknown) => unknown) => callback(client)) };
    return new AvailabilityService(database as unknown as WorkforceDatabaseService);
  }

  it('refuses an approver deciding an absence of their own person', async () => {
    await expect(
      service('planner-1').decideAbsence({ principal: approver, correlationId: 'c' } as never, absenceId, 'APPROVED', { expectedVersion: 1 }),
    ).rejects.toMatchObject({ response: { code: 'WORKFORCE_FOUR_EYES' } });
  });

  it("goes past the check for someone else's absence", async () => {
    await expect(
      service('technician-1').decideAbsence({ principal: approver, correlationId: 'c' } as never, absenceId, 'APPROVED', { expectedVersion: 1 }),
    ).rejects.toThrow(/unexpected query/);
  });
});
