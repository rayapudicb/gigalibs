import { describe, expect, it, vi } from 'vitest';
import type { WorkforceDatabaseService } from '../database/database.service.js';
import { AvailabilityService } from './availability.service.js';

// WI-OI-120u (owner D1a): workforce.absences.request-own reaches only the person linked to the caller's login; the
// service finds that person itself, so no caller can name another.
describe('own absences', () => {
  const member = {
    tenantId: 'tenant-a',
    subject: 'member-1',
    sessionId: 's',
    authVersion: 1,
    permissions: ['workforce.absences.request-own'],
    roles: ['MEMBER'],
    persona: 'WORKFORCE_MEMBER' as const,
    orgScope: { mode: 'FLAT_TENANT' as const },
    spatialScope: { mode: 'UNBOUNDED' as const },
  };
  const OWN = '00000000-0000-4000-8000-0000000000b1';
  const OTHER = '00000000-0000-4000-8000-0000000000b2';
  const TYPE = '00000000-0000-4000-8000-0000000000c1';
  const ABSENCE = '00000000-0000-4000-8000-0000000000a1';
  const request = {
    absenceTypeId: TYPE,
    startsAt: '2026-11-02T09:00:00Z',
    endsAt: '2026-11-02T17:00:00Z',
  };

  function service(linkedPerson: string | null, absenceOf = OWN) {
    const queries: { sql: string; values: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        queries.push({ sql, values });
        if (/platform_user_id = \$2 AND status = 'ACTIVE'/.test(sql))
          return { rows: linkedPerson ? [{ id: linkedPerson }] : [] };
        if (
          /FROM gigalibs_workforce\.absences WHERE tenant_id = \$1 AND id = \$2 FOR UPDATE/.test(
            sql,
          )
        ) {
          return {
            rows: [
              {
                id: ABSENCE,
                resource_id: absenceOf,
                status: 'REQUESTED',
                starts_at: '2026-11-02T09:00:00Z',
                version: 1,
              },
            ],
          };
        }
        if (/FROM gigalibs_workforce\.absences a/.test(sql)) return { rows: [] };
        throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
      }),
    };
    const database = {
      withTenantTransaction: vi.fn(async (_tenant: string, callback: (value: unknown) => unknown) =>
        callback(client),
      ),
    };
    return {
      queries,
      availability: new AvailabilityService(database as unknown as WorkforceDatabaseService),
    };
  }
  const context = { principal: member, correlationId: 'c' } as never;

  it('refuses a login that is linked to no person', async () => {
    await expect(
      service(null).availability.requestOwnAbsence(context, request),
    ).rejects.toMatchObject({ response: { code: 'WORKFORCE_NOT_A_WORKER' } });
    expect((await service(null).availability.listOwnAbsences(member as never)).items).toEqual([]);
  });

  it('asks for the absence of the linked person, never one named by the caller', async () => {
    await expect(
      service(OWN).availability.requestOwnAbsence(context, { ...request, resourceId: OTHER }),
    ).rejects.toMatchObject({
      response: { code: 'WORKFORCE_VALIDATION_FAILED' },
    });
    const { availability, queries } = service(OWN);
    // The request then checks the person (a query this fake does not answer); it got there for the linked person.
    await expect(availability.requestOwnAbsence(context, request)).rejects.toThrow(
      /unexpected query/,
    );
    expect(queries.at(-1)?.values).toContain(OWN);
    expect(queries.at(-1)?.values).not.toContain(OTHER);
  });

  it("refuses cancelling someone else's absence, and finds none of theirs", async () => {
    await expect(
      service(OWN, OTHER).availability.cancelOwnAbsence(context, ABSENCE, { expectedVersion: 1 }),
    ).rejects.toMatchObject({
      response: { code: 'WORKFORCE_NOT_OWN_ABSENCE' },
    });
    await expect(service(OWN).availability.getOwnAbsence(member as never, ABSENCE)).rejects.toThrow(
      /not found/,
    );
  });
});
