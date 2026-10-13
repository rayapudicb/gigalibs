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
        // The own-absence lock is scoped to the caller's person: someone else's absence is not found.
        if (
          /FROM gigalibs_workforce\.absences WHERE tenant_id = \$1 AND id = \$2 AND resource_id = \$3 FOR UPDATE/.test(
            sql,
          )
        ) {
          const row = {
            id: ABSENCE,
            resource_id: absenceOf,
            status: 'REQUESTED',
            starts_at: '2026-11-02T09:00:00Z',
            version: 1,
          };
          return { rows: values[2] === absenceOf ? [row] : [] };
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

  it("answers not found for someone else's absence, whatever its version, and finds none of theirs", async () => {
    // Security review I2: the same answer for any version, so a person cannot probe other people's absences.
    for (const expectedVersion of [1, 7]) {
      await expect(
        service(OWN, OTHER).availability.cancelOwnAbsence(context, ABSENCE, { expectedVersion }),
      ).rejects.toThrow(/not found/);
    }
    await expect(
      service(OWN).availability.cancelOwnAbsence(context, ABSENCE, { expectedVersion: 7 }),
    ).rejects.toMatchObject({
      response: { code: 'WORKFORCE_VERSION_CONFLICT' },
    });
    await expect(service(OWN).availability.getOwnAbsence(member as never, ABSENCE)).rejects.toThrow(
      /not found/,
    );
  });
});

// Security review M2 (owner, M2a): an absence of your own person always waits for someone else, whatever its type; and
// only a manager for the whole workspace changes absence types.
describe('four-eyes for absences of your own person', () => {
  const PERSON = '00000000-0000-4000-8000-0000000000b1';
  const TYPE = '00000000-0000-4000-8000-0000000000c1';
  const supervisor = (subject: string, spatialScope: unknown = { mode: 'UNBOUNDED' }) =>
    ({
      tenantId: 'tenant-a',
      subject,
      permissions: ['workforce.absences.request', 'workforce.calendars.manage'],
      spatialScope,
    }) as never;

  function service() {
    const inserted: unknown[][] = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        if (/SELECT resource_type, status, platform_user_id/.test(sql))
          return {
            rows: [{ resource_type: 'HUMAN', status: 'ACTIVE', platform_user_id: 'supervisor-1' }],
          };
        if (/FROM gigalibs_workforce\.absence_types WHERE tenant_id = \$1 AND id = \$2$/.test(sql))
          return { rows: [{ id: TYPE, status: 'ACTIVE', requires_approval: false }] };
        if (/INSERT INTO gigalibs_workforce\.absences/.test(sql)) {
          inserted.push(values);
          throw new Error('stop after the insert');
        }
        throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
      }),
    };
    const database = {
      withTenantTransaction: vi.fn(async (_tenant: string, callback: (value: unknown) => unknown) =>
        callback(client),
      ),
    };
    return {
      inserted,
      availability: new AvailabilityService(database as unknown as WorkforceDatabaseService),
    };
  }
  const request = {
    resourceId: PERSON,
    absenceTypeId: TYPE,
    startsAt: '2026-11-02T09:00:00Z',
    endsAt: '2026-11-02T17:00:00Z',
  };

  it('files your own absence as requested even when its type needs no approval', async () => {
    const { availability, inserted } = service();
    await expect(
      availability.requestAbsence(
        { principal: supervisor('supervisor-1'), correlationId: 'c' } as never,
        request,
      ),
    ).rejects.toThrow(/stop after/);
    // status, decided_by: waiting, decided by nobody yet.
    expect([inserted[0]?.[5], inserted[0]?.[8]]).toEqual(['REQUESTED', null]);
  });

  it('still approves at once a no-approval absence someone else files for the person', async () => {
    const { availability, inserted } = service();
    await expect(
      availability.requestAbsence(
        { principal: supervisor('supervisor-2'), correlationId: 'c' } as never,
        request,
      ),
    ).rejects.toThrow(/stop after/);
    expect([inserted[0]?.[5], inserted[0]?.[8]]).toEqual(['APPROVED', 'supervisor-2']);
  });

  it('lets only a manager for the whole workspace change absence types', async () => {
    const scoped = supervisor('supervisor-3', {
      mode: 'SCOPED_PLACES',
      place_ids: ['00000000-0000-4000-8000-000000000001'],
    });
    const { availability } = service();
    await expect(
      availability.createAbsenceType({ principal: scoped, correlationId: 'c' } as never, {
        code: 'FREE',
        name: 'Free days',
        requiresApproval: false,
      }),
    ).rejects.toMatchObject({
      response: { code: 'WORKFORCE_OUT_OF_SCOPE' },
    });
    await expect(
      availability.updateAbsenceType({ principal: scoped, correlationId: 'c' } as never, TYPE, {
        expectedVersion: 1,
        requiresApproval: false,
      }),
    ).rejects.toMatchObject({
      response: { code: 'WORKFORCE_OUT_OF_SCOPE' },
    });
  });
});
