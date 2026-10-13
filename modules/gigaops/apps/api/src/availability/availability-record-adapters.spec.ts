import { randomUUID } from 'node:crypto';
import type { IdempotencyStore, ModulePrincipal } from '@gigalibs/module-sdk';
import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  type WorkforceRecordDependencies,
  workforceRecordDispatcher,
} from '../resources/workforce-record-adapters.js';

// WI-OI-120u (M-WF1 Slice 2): availability, absences, own absences, absence types, calendars and bookings behind
// metadata windows. The dispatcher runs as the record controller runs it, with the shipped window rules (gigaops).

const principal = (subject: string, permissions: string[]) =>
  ({
    tenantId: 'tenant-test',
    subject,
    sessionId: 's',
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'OPERATIONS_SUPERVISOR',
  }) as unknown as ModulePrincipal;

// The module roles of module.yaml.
const supervisor = principal('supervisor-1', [
  'workforce:read',
  'workforce.resources.read',
  'workforce.bookings.read',
  'workforce.availability.read',
  'workforce.availability.manage',
  'workforce.calendars.read',
  'workforce.calendars.manage',
  'workforce.absences.read',
  'workforce.absences.request',
  'workforce.absences.approve',
]);
const member = principal('member-1', [
  'workforce:read',
  'workforce.resources.read',
  'workforce.jobs.read',
  'workforce.time.punch',
  'workforce.absences.request-own',
]);
const as = (who: ModulePrincipal) => ({ principal: who, correlationId: 'correlation-1' });

const PERSON = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TYPE = '33333333-3333-4333-8333-333333333333';
const PATTERN = '44444444-4444-4444-8444-444444444444';
const ABSENCE = '55555555-5555-4555-8555-555555555555';
const CALENDAR = '66666666-6666-4666-8666-666666666666';
const CLOSURE = '77777777-7777-4777-8777-777777777777';
const BOOKING = '88888888-8888-4888-8888-888888888888';
const SITE = '99999999-9999-4999-8999-999999999999';

const pattern = {
  id: PATTERN,
  resourceId: PERSON,
  effectiveFrom: '2026-10-01',
  effectiveTo: null,
  timeZone: 'Europe/London',
  weeklySlots: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((day) => ({
    day,
    start: '09:00',
    end: '17:00',
  })),
  weeklyMinutes: 2400,
  version: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const absence = (overrides: Record<string, unknown> = {}) => ({
  id: ABSENCE,
  resourceId: PERSON,
  resourceName: 'Ana Ortiz',
  absenceTypeId: TYPE,
  absenceTypeName: 'Vacation',
  paid: true,
  startsAt: '2026-11-02T09:00:00.000Z',
  endsAt: '2026-11-06T17:00:00.000Z',
  status: 'APPROVED',
  note: null,
  requestedBy: 'member-1',
  decidedBy: 'supervisor-2',
  decidedAt: '2026-10-20T10:00:00.000Z',
  decisionReason: null,
  version: 3,
  createdAt: '2026-10-13T08:00:00.000Z',
  ...overrides,
});

const calendar = {
  id: CALENDAR,
  code: 'NP',
  name: 'North plant',
  siteRef: SITE,
  closures: [{ id: CLOSURE, closureDate: '2026-12-25', label: 'Christmas', status: 'ACTIVE' }],
  version: 4,
};

const booking = (id: string, startsAt: string) => ({
  id,
  requirementId: randomUUID(),
  requirementTitle: `Work ${startsAt.slice(0, 10)}`,
  resourceId: OTHER,
  resourceName: 'Bo Brown',
  siteRef: SITE,
  startsAt,
  endsAt: startsAt.replace('T08', 'T16'),
  status: 'CONFIRMED',
  overrideReason: null,
  cancelReason: null,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});

function services() {
  const availability = {
    listPatterns: vi.fn().mockResolvedValue({ items: [pattern] }),
    listAllPatterns: vi.fn().mockResolvedValue({
      items: [
        { ...pattern, resourceName: 'Ana Ortiz' },
        { ...pattern, id: randomUUID(), resourceId: OTHER, resourceName: 'Bo Brown' },
      ],
    }),
    getPattern: vi.fn().mockResolvedValue(pattern),
    createPattern: vi.fn().mockResolvedValue(pattern),
    endPattern: vi.fn().mockResolvedValue({ ...pattern, effectiveTo: '2026-12-01', version: 3 }),
    listAbsences: vi.fn().mockResolvedValue({
      items: [
        absence(),
        absence({
          id: randomUUID(),
          status: 'REQUESTED',
          resourceId: OTHER,
          resourceName: 'Bo Brown',
        }),
      ],
    }),
    getAbsence: vi.fn().mockResolvedValue(absence()),
    requestAbsence: vi
      .fn()
      .mockImplementation(async (_context, input) => absence({ ...input, status: 'REQUESTED' })),
    decideAbsence: vi
      .fn()
      .mockImplementation(async (_context, _id, decision) =>
        absence({ status: decision, version: 4 }),
      ),
    cancelAbsence: vi.fn().mockResolvedValue(absence({ status: 'CANCELLED', version: 4 })),
    listOwnAbsences: vi.fn().mockResolvedValue({ items: [absence()] }),
    getOwnAbsence: vi.fn().mockImplementation(async (_principal, id: string) => {
      if (id !== ABSENCE) throw new NotFoundException('The absence was not found.');
      return absence();
    }),
    requestOwnAbsence: vi
      .fn()
      .mockImplementation(async (_context, input) => absence({ ...input, status: 'REQUESTED' })),
    cancelOwnAbsence: vi.fn().mockResolvedValue(absence({ status: 'CANCELLED', version: 4 })),
    ownTimeZone: vi.fn().mockResolvedValue('Europe/London'),
    workingTimeZones: vi
      .fn()
      .mockImplementation(
        async (_principal, ids: string[]) =>
          new Map(ids.filter((id) => id === PERSON).map((id) => [id, 'Europe/London'])),
      ),
    listAbsenceTypes: vi.fn().mockResolvedValue({
      items: [
        {
          id: TYPE,
          code: 'VACATION',
          name: 'Vacation',
          paid: true,
          requiresApproval: true,
          status: 'ACTIVE',
          version: 1,
        },
        {
          id: randomUUID(),
          code: 'OLD',
          name: 'Old leave',
          paid: false,
          requiresApproval: true,
          status: 'INACTIVE',
          version: 1,
        },
      ],
    }),
    createAbsenceType: vi.fn().mockImplementation(async (_context, input) => ({
      id: randomUUID(),
      status: 'ACTIVE',
      version: 1,
      ...input,
    })),
    updateAbsenceType: vi.fn().mockImplementation(async (_context, id, input) => ({
      id,
      code: 'VACATION',
      name: 'Vacation',
      paid: true,
      requiresApproval: true,
      status: input.status ?? 'ACTIVE',
      version: 2,
    })),
    listCalendars: vi.fn().mockResolvedValue({ items: [calendar] }),
    createCalendar: vi.fn().mockImplementation(async (_context, input) => ({
      id: randomUUID(),
      closures: [],
      version: 1,
      ...input,
    })),
    addClosure: vi.fn().mockImplementation(async (_context, _id, input) => ({
      ...calendar,
      closures: [...calendar.closures, { id: randomUUID(), status: 'ACTIVE', ...input }],
    })),
    withdrawClosure: vi.fn().mockResolvedValue({ ...calendar, closures: [] }),
  };
  const bookings = {
    listBookings: vi.fn().mockResolvedValue({
      items: [
        booking(BOOKING, '2026-11-03T08:00:00.000Z'),
        booking(randomUUID(), '2026-11-01T08:00:00.000Z'),
        booking(randomUUID(), '2026-11-02T08:00:00.000Z'),
      ],
    }),
    getBooking: vi.fn().mockResolvedValue(booking(BOOKING, '2026-11-03T08:00:00.000Z')),
  };
  return {
    availability,
    bookings,
    deps: {
      availability,
      bookings,
      resources: {},
      jobs: {},
    } as unknown as WorkforceRecordDependencies,
  };
}

const noIdempotency: IdempotencyStore = {
  claim: async () => null,
  complete: async () => undefined,
  release: async () => undefined,
};
const setup = () => {
  const domain = services();
  return { ...domain, records: workforceRecordDispatcher(domain.deps, noIdempotency) };
};
const status = async (run: Promise<unknown>) => {
  try {
    await run;
    return 'OK';
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : String(error);
  }
};

describe('Workforce availability records (WI-OI-120u Slice 2)', () => {
  it('registers the availability record types and their pickers', () => {
    const { records } = setup();
    const { entities, resolvers } = records.describe();
    expect(entities.map((entity) => entity.entityKey)).toEqual(
      expect.arrayContaining([
        'wf.availability-patterns',
        'wf.absences',
        'wf.my-absences',
        'wf.absence-types',
        'wf.calendars',
        'wf.calendar-closures',
        'wf.bookings',
      ]),
    );
    expect(resolvers.map((resolver) => resolver.key)).toEqual(
      expect.arrayContaining(['wf-absence-types', 'wf-calendars']),
    );
  });

  describe('working weeks', () => {
    it('adds a week from the People tab as one line of text', async () => {
      const { records, availability } = setup();
      await records.create(
        as(supervisor),
        'wf.availability-patterns',
        {
          'resource-id': PERSON,
          'effective-from': '2026-11-01',
          'time-zone': 'Europe/London',
          'working-hours': 'Mon-Thu 08:00-16:00; Fri 08:00-12:00',
        },
        randomUUID(),
      );
      const input = availability.createPattern.mock.calls[0]?.[1];
      expect(input).toMatchObject({
        resourceId: PERSON,
        effectiveFrom: '2026-11-01',
        timeZone: 'Europe/London',
      });
      expect(input.weeklySlots).toHaveLength(5);
      expect(input.weeklySlots[4]).toEqual({ day: 'FRIDAY', start: '08:00', end: '12:00' });
      expect(
        await status(
          records.create(
            as(supervisor),
            'wf.availability-patterns',
            {
              'resource-id': PERSON,
              'effective-from': '2026-11-01',
              'time-zone': 'UTC',
              'working-hours': 'weekdays',
            },
            randomUUID(),
          ),
        ),
      ).toBe(400);
    });

    it("shows a person's weeks under them, and everyone's in the window, searchable by name", async () => {
      const { records } = setup();
      const mine = await records.list(supervisor, 'wf.availability-patterns', { parentId: PERSON });
      expect(mine.items[0]).toMatchObject({
        'working-hours': 'Mon-Fri 09:00-17:00',
        'weekly-hours': '40.00',
        'effective-to': null,
      });
      expect(
        (await records.list(supervisor, 'wf.availability-patterns', { search: 'bo' })).items.map(
          (item) => item['resource-id'],
        ),
      ).toEqual([OTHER]);
    });

    it('ends a week with the version read and the first day without it', async () => {
      const { records, availability } = setup();
      await records.action(
        as(supervisor),
        'wf.availability-patterns',
        PATTERN,
        'end',
        { 'effective-to': '2026-12-01', expectedVersion: 2 },
        randomUUID(),
      );
      expect(availability.endPattern).toHaveBeenCalledWith(as(supervisor), PATTERN, {
        expectedVersion: 2,
        effectiveTo: '2026-12-01',
      });
      expect(
        await status(
          records.action(
            as(member),
            'wf.availability-patterns',
            PATTERN,
            'end',
            { 'effective-to': '2026-12-01', expectedVersion: 2 },
            randomUUID(),
          ),
        ),
      ).toBe(403);
    });
  });

  describe('absences', () => {
    it("takes and shows times in the person's working time zone", async () => {
      const { records, availability } = setup();
      const created = await records.create(
        as(supervisor),
        'wf.absences',
        {
          'resource-id': PERSON,
          'absence-type-id': TYPE,
          'starts-at': '2026-11-02T09:00',
          'ends-at': '2026-11-06T17:30',
          note: 'Family visit',
        },
        randomUUID(),
      );
      // London is on GMT in November.
      expect(availability.requestAbsence).toHaveBeenCalledWith(as(supervisor), {
        resourceId: PERSON,
        absenceTypeId: TYPE,
        startsAt: '2026-11-02T09:00:00.000Z',
        endsAt: '2026-11-06T17:30:00.000Z',
        note: 'Family visit',
      });
      expect(created).toMatchObject({
        'starts-at': '2026-11-02T09:00',
        'time-zone': 'Europe/London',
        status: 'REQUESTED',
      });
    });

    it('lists requests waiting for a decision first; people without a working week show UTC', async () => {
      const { records } = setup();
      const page = await records.list(supervisor, 'wf.absences', {});
      expect(page.items.map((item) => [item.status, item['time-zone']])).toEqual([
        ['REQUESTED', 'UTC'],
        ['APPROVED', 'Europe/London'],
      ]);
    });

    it('approves, rejects with a reason and cancels with the version read; a conflict answers 412', async () => {
      const { records, availability } = setup();
      await records.action(
        as(supervisor),
        'wf.absences',
        ABSENCE,
        'approve',
        { reason: '', expectedVersion: 3 },
        randomUUID(),
      );
      expect(availability.decideAbsence).toHaveBeenLastCalledWith(
        as(supervisor),
        ABSENCE,
        'APPROVED',
        { expectedVersion: 3 },
      );
      await records.action(
        as(supervisor),
        'wf.absences',
        ABSENCE,
        'reject',
        { reason: 'Peak week', expectedVersion: 3 },
        randomUUID(),
      );
      expect(availability.decideAbsence).toHaveBeenLastCalledWith(
        as(supervisor),
        ABSENCE,
        'REJECTED',
        { expectedVersion: 3, reason: 'Peak week' },
      );
      await records.action(
        as(supervisor),
        'wf.absences',
        ABSENCE,
        'cancel',
        { expectedVersion: 3 },
        randomUUID(),
      );
      expect(availability.cancelAbsence).toHaveBeenCalledWith(as(supervisor), ABSENCE, {
        expectedVersion: 3,
      });
      availability.decideAbsence.mockRejectedValueOnce(
        new ConflictException({ code: 'WORKFORCE_VERSION_CONFLICT' }),
      );
      expect(
        await status(
          records.action(
            as(supervisor),
            'wf.absences',
            ABSENCE,
            'approve',
            { expectedVersion: 2 },
            randomUUID(),
          ),
        ),
      ).toBe(412);
    });

    it("keeps a member out of everyone's absences", async () => {
      const { records, availability } = setup();
      expect(await status(records.list(member, 'wf.absences', {}))).toBe(403);
      expect(
        await status(
          records.action(
            as(member),
            'wf.absences',
            ABSENCE,
            'approve',
            { expectedVersion: 3 },
            randomUUID(),
          ),
        ),
      ).toBe(403);
      expect(
        await status(
          records.create(
            as(member),
            'wf.absences',
            {
              'resource-id': OTHER,
              'absence-type-id': TYPE,
              'starts-at': '2026-11-02T09:00',
              'ends-at': '2026-11-02T17:00',
            },
            randomUUID(),
          ),
        ),
      ).toBe(403);
      expect(availability.requestAbsence).not.toHaveBeenCalled();
    });

    it('requires a type, a start and an end', async () => {
      const { records } = setup();
      expect(
        await status(
          records.create(
            as(supervisor),
            'wf.absences',
            {
              'resource-id': PERSON,
              'starts-at': '2026-11-02T09:00',
              'ends-at': '2026-11-02T17:00',
            },
            randomUUID(),
          ),
        ),
      ).toBe(422);
    });
  });

  describe('my absences (owner D1a)', () => {
    it('lets a person ask for and cancel their own absence, in their own time zone', async () => {
      const { records, availability } = setup();
      await records.create(
        as(member),
        'wf.my-absences',
        { 'absence-type-id': TYPE, 'starts-at': '2026-07-06T09:00', 'ends-at': '2026-07-06T13:00' },
        randomUUID(),
      );
      // London is on BST in July: the person's 09:00 is 08:00 UTC. No person is named: the service finds them.
      expect(availability.requestOwnAbsence).toHaveBeenCalledWith(as(member), {
        absenceTypeId: TYPE,
        startsAt: '2026-07-06T08:00:00.000Z',
        endsAt: '2026-07-06T12:00:00.000Z',
      });
      const page = await records.list(member, 'wf.my-absences', {});
      expect(page.items[0]).not.toHaveProperty('resource-id');
      await records.action(
        as(member),
        'wf.my-absences',
        ABSENCE,
        'cancel',
        { expectedVersion: 3, reason: 'Plans changed' },
        randomUUID(),
      );
      expect(availability.cancelOwnAbsence).toHaveBeenCalledWith(as(member), ABSENCE, {
        expectedVersion: 3,
        reason: 'Plans changed',
      });
    });

    it('refuses a person named in the request (the service decides who), and anyone without request-own', async () => {
      const { records } = setup();
      expect(
        await status(
          records.create(
            as(member),
            'wf.my-absences',
            {
              'resource-id': OTHER,
              'absence-type-id': TYPE,
              'starts-at': '2026-07-06T09:00',
              'ends-at': '2026-07-06T13:00',
            },
            randomUUID(),
          ),
        ),
      ).toBe(400);
      expect(await status(records.list(supervisor, 'wf.my-absences', {}))).toBe(403);
      expect(await status(records.get(member, 'wf.my-absences', randomUUID()))).toBe(404);
    });

    it('offers a person the active absence types', async () => {
      const { records } = setup();
      expect(await records.lookup(member, 'wf-absence-types', {})).toEqual([
        { value: TYPE, label: 'Vacation' },
      ]);
    });
  });

  describe('absence types, calendars and closures', () => {
    it('creates and edits absence types; a code never changes', async () => {
      const { records, availability } = setup();
      await records.create(
        as(supervisor),
        'wf.absence-types',
        { code: 'SICK', name: 'Sickness', paid: true },
        randomUUID(),
      );
      expect(availability.createAbsenceType).toHaveBeenCalledWith(as(supervisor), {
        code: 'SICK',
        name: 'Sickness',
        paid: true,
        requiresApproval: true,
      });
      expect(
        await status(
          records.update(as(supervisor), 'wf.absence-types', TYPE, { code: 'HOLS' }, '"1"'),
        ),
      ).toBe(400);
      await records.action(
        as(supervisor),
        'wf.absence-types',
        TYPE,
        'deactivate',
        { expectedVersion: 1 },
        randomUUID(),
      );
      expect(availability.updateAbsenceType).toHaveBeenLastCalledWith(as(supervisor), TYPE, {
        expectedVersion: 1,
        status: 'INACTIVE',
      });
    });

    it('creates a site calendar, adds a closure to it and withdraws one', async () => {
      const { records, availability } = setup();
      await records.create(
        as(supervisor),
        'wf.calendars',
        { code: 'SP', name: 'South plant', 'site-ref': SITE },
        randomUUID(),
      );
      expect(availability.createCalendar).toHaveBeenCalledWith(as(supervisor), {
        code: 'SP',
        name: 'South plant',
        siteRef: SITE,
      });
      const added = await records.create(
        as(supervisor),
        'wf.calendar-closures',
        { 'calendar-id': CALENDAR, 'closure-date': '2026-12-26', label: 'Boxing Day' },
        randomUUID(),
      );
      expect(added).toMatchObject({
        'calendar-id': CALENDAR,
        'closure-date': '2026-12-26',
        status: 'ACTIVE',
      });
      const withdrawn = await records.action(
        as(supervisor),
        'wf.calendar-closures',
        CLOSURE,
        'withdraw',
        {},
        randomUUID(),
      );
      expect(availability.withdrawClosure).toHaveBeenCalledWith(as(supervisor), CALENDAR, CLOSURE);
      expect(withdrawn.status).toBe('WITHDRAWN');
    });
  });

  describe('bookings (read only)', () => {
    it('lists bookings by start, paged, in each person’s time zone; nothing can be written', async () => {
      const { records } = setup();
      const page = await records.list(supervisor, 'wf.bookings', {
        sort: 'starts-at',
        page: '1',
        pageSize: '2',
      });
      expect(page.total).toBe(3);
      expect(page.items.map((item) => item['starts-at'])).toEqual([
        '2026-11-01T08:00',
        '2026-11-02T08:00',
      ]);
      expect((await records.get(supervisor, 'wf.bookings', BOOKING))['requirement-title']).toBe(
        'Work 2026-11-03',
      );
      expect(
        await status(
          records.create(as(supervisor), 'wf.bookings', { 'requirement-title': 'x' }, randomUUID()),
        ),
      ).not.toBe('OK');
      expect(await status(records.list(member, 'wf.bookings', {}))).toBe(403);
    });
  });
});
