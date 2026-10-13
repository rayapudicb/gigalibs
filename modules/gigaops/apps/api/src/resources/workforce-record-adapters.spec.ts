import { randomUUID } from 'node:crypto';
import type {
  IdempotencyEntry,
  IdempotencyStore,
  ModulePrincipal,
  RecordValues,
} from '@gigalibs/module-sdk';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  type WorkforceRecordDependencies,
  workforceRecordDispatcher,
} from './workforce-record-adapters.js';

// WI-OI-120u (M-WF1 Slice 1): Workforce on metadata windows. The dispatcher runs as the record controller runs it, with
// the shipped window rules (gigaops), so what the People window sends is what these tests send.

const principal = (subject: string, permissions: string[]) =>
  ({
    tenantId: 'tenant-test',
    subject,
    sessionId: 'session-1',
    authVersion: 1,
    permissions,
    roles: [],
    persona: 'OPERATIONS_SUPERVISOR',
  }) as unknown as ModulePrincipal;

// The Workforce supervisor module role (module.yaml), less what these records do not use.
const supervisor = principal('supervisor-1', [
  'workforce:read',
  'workforce.resources.read',
  'workforce.resources.manage',
  'workforce.capabilities.read',
  'workforce.capabilities.manage',
  'workforce.jobs.read',
  'workforce.jobs.manage',
]);
// A workspace administrator holds the whole area, which is the only way to hold workforce.resources.link.
const admin = principal('admin-1', ['workforce:*']);
const member = principal('member-1', [
  'workforce:read',
  'workforce.resources.read',
  'workforce.capabilities.read',
  'workforce.jobs.read',
]);

const as = (who: ModulePrincipal) => ({ principal: who, correlationId: 'correlation-1' });

const RESOURCE_ID = '11111111-1111-4111-8111-111111111111';
const CAPABILITY_ID = '33333333-3333-4333-8333-333333333333';
const RETIRED_CAPABILITY_ID = '66666666-6666-4666-8666-666666666666';
const PROFILE_ID = '44444444-4444-4444-8444-444444444444';
const POSITION_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'user-ana';

const resource = {
  id: RESOURCE_ID,
  referenceCode: 'EMP-001',
  displayName: 'Alice Engineer',
  resourceType: 'HUMAN' as const,
  platformUserId: null as string | null,
  status: 'ACTIVE' as const,
  version: 3,
  qualificationCount: 1,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

const qualification = {
  id: '22222222-2222-4222-8222-222222222222',
  resourceId: RESOURCE_ID,
  capabilityDefinitionId: CAPABILITY_ID,
  capabilityCode: 'MECH-2',
  capabilityName: 'Mechanical level 2',
  proficiency: 'ADVANCED' as const,
  status: 'ACTIVE' as const,
  validFrom: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  issuingAuthority: 'Engineering Board',
  evidenceReference: 'CERT-2026-01',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profile = (code: string, id = PROFILE_ID) => ({
  id,
  code,
  status: 'ACTIVE' as const,
  version: 2,
  current: { title: `Title ${code}`, description: null, workerCategory: 'FULL_TIME' as const },
  positionCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const position = {
  id: POSITION_ID,
  code: 'POS-001',
  jobProfileId: PROFILE_ID,
  title: 'Title SR-MECH',
  siteRef: null,
  organizationUnitId: null,
  fte: 1,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  status: 'OPEN' as const,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** The domain services, answering as they do; a change to a stale version is refused as theirs is. */
function services() {
  const current = { ...resource };
  const resources = {
    listResources: vi.fn().mockResolvedValue({
      items: [current],
      total: 41,
      page: 1,
      pageSize: 25,
      generatedAt: '2026-10-13T00:00:00.000Z',
    }),
    lookupResources: vi.fn().mockResolvedValue([current]),
    getResource: vi.fn().mockImplementation(async (_principal, id: string) => {
      if (id !== RESOURCE_ID) throw new NotFoundException('Not found');
      return { ...current, qualifications: [qualification] };
    }),
    createResource: vi
      .fn()
      .mockImplementation(async (_context, input: Record<string, unknown>) => ({
        ...current,
        ...input,
        version: 1,
      })),
    updateResource: vi
      .fn()
      .mockImplementation(async (context, _id: string, input: Record<string, unknown>) => {
        if (
          input.platformUserId !== undefined &&
          !context.principal.permissions.includes('workforce:*')
        ) {
          throw new ForbiddenException({
            code: 'WORKFORCE_LINK_FORBIDDEN',
            message: 'Only a workspace administrator can link a person to a login.',
          });
        }
        if (input.expectedVersion !== current.version) {
          throw new ConflictException({
            code: 'WORKFORCE_RESOURCE_VERSION_CONFLICT',
            message: 'The resource was changed by another request.',
          });
        }
        const { expectedVersion: _version, reason: _reason, ...changes } = input;
        Object.assign(current, changes, { version: current.version + 1 });
        return { ...current };
      }),
    assignCapability: vi.fn().mockResolvedValue(qualification),
    listCapabilityDefinitions: vi.fn().mockResolvedValue({
      items: [
        { id: CAPABILITY_ID, code: 'MECH-2', name: 'Mechanical level 2', status: 'ACTIVE' },
        { id: RETIRED_CAPABILITY_ID, code: 'OLD-1', name: 'Retired skill', status: 'INACTIVE' },
      ],
      generatedAt: '2026-10-13T00:00:00.000Z',
    }),
  };
  const jobs = {
    listProfiles: vi.fn().mockResolvedValue({
      items: [
        profile('ZZ-LAST', '77777777-7777-4777-8777-777777777777'),
        profile('SR-MECH'),
        profile('AA-FIRST', '88888888-8888-4888-8888-888888888888'),
      ],
      asOf: '2026-10-13',
    }),
    getProfile: vi.fn().mockResolvedValue(profile('SR-MECH')),
    createProfile: vi.fn().mockResolvedValue(profile('SR-MECH')),
    setProfileStatus: vi
      .fn()
      .mockImplementation(async (_context, _id: string, input: { status: string }) => ({
        ...profile('SR-MECH'),
        status: input.status,
        version: 3,
      })),
    listPositions: vi.fn().mockResolvedValue({ items: [position], asOf: '2026-10-13' }),
    getPosition: vi.fn().mockResolvedValue(position),
    createPosition: vi.fn().mockResolvedValue(position),
    updatePosition: vi.fn().mockResolvedValue({ ...position, version: 2 }),
  };
  return { resources, jobs, deps: { resources, jobs } as unknown as WorkforceRecordDependencies };
}

/** The dispatcher's Idempotency-Key store, as record_idempotency behaves for one request at a time. */
function memoryStore(): IdempotencyStore {
  const entries = new Map<string, IdempotencyEntry>();
  return {
    async claim(tenantId, key, _operation, requestHash) {
      const existing = entries.get(`${tenantId}:${key}`);
      if (existing) return existing;
      entries.set(`${tenantId}:${key}`, { requestHash, state: 'IN_PROGRESS', response: null });
      return null;
    },
    async complete(tenantId, key, response: RecordValues) {
      const existing = entries.get(`${tenantId}:${key}`);
      if (existing)
        entries.set(`${tenantId}:${key}`, { ...existing, state: 'COMPLETED', response });
    },
    async release(tenantId, key) {
      entries.delete(`${tenantId}:${key}`);
    },
  };
}

const setup = () => {
  const domain = services();
  return { ...domain, records: workforceRecordDispatcher(domain.deps, memoryStore()) };
};

const status = async (run: Promise<unknown>) => {
  try {
    await run;
    return 'OK';
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : String(error);
  }
};

describe('Workforce record dispatcher (WI-OI-120u)', () => {
  it('registers People, skills, job profiles and positions, and their pickers', () => {
    const { records } = setup();
    const description = records.describe();
    expect(description.entities.map((entity) => entity.entityKey)).toEqual([
      'wf.resources',
      'wf.resource-skills',
      'wf.job-profiles',
      'wf.positions',
    ]);
    expect(description.resolvers.map((resolver) => resolver.key)).toEqual([
      'wf-resources',
      'wf-capabilities',
      'wf-jobs',
    ]);
  });

  describe('People', () => {
    it('opens the list as the window does (sorted by name, paged, searchable) with the domain total', async () => {
      const { records, resources } = setup();
      const page = await records.list(supervisor, 'wf.resources', {
        page: '2',
        pageSize: '20',
        sort: 'display-name',
        direction: 'DESC',
        search: 'ali',
      });
      expect(page).toMatchObject({ total: 41, page: 2, pageSize: 20 });
      expect(page.items[0]).toMatchObject({
        id: RESOURCE_ID,
        'reference-code': 'EMP-001',
        'display-name': 'Alice Engineer',
        'platform-user-id': null,
      });
      expect(resources.listResources).toHaveBeenCalledWith(supervisor, {
        page: 2,
        pageSize: 20,
        direction: 'DESC',
        q: 'ali',
      });
    });

    it('creates and renames a person', async () => {
      const { records, resources } = setup();
      await records.create(
        as(supervisor),
        'wf.resources',
        { 'reference-code': 'EMP-002', 'display-name': 'Bo', 'resource-type': 'HUMAN' },
        randomUUID(),
      );
      expect(resources.createResource).toHaveBeenCalledWith(
        { principal: supervisor, correlationId: 'correlation-1' },
        { referenceCode: 'EMP-002', displayName: 'Bo', resourceType: 'HUMAN' },
      );
      const renamed = await records.update(
        as(supervisor),
        'wf.resources',
        RESOURCE_ID,
        { 'display-name': 'Alice Senior' },
        '"3"',
      );
      expect(renamed).toMatchObject({ 'display-name': 'Alice Senior', version: 4 });
    });

    it('keeps a reference code once given', async () => {
      const { records, resources } = setup();
      expect(
        await status(
          records.update(
            as(supervisor),
            'wf.resources',
            RESOURCE_ID,
            { 'reference-code': 'EMP-009' },
            '"3"',
          ),
        ),
      ).toBe(400);
      expect(resources.updateResource).not.toHaveBeenCalled();
    });

    it('answers a stale edit as the window expects (412)', async () => {
      const { records } = setup();
      expect(
        await status(
          records.update(
            as(supervisor),
            'wf.resources',
            RESOURCE_ID,
            { 'display-name': 'Late' },
            '"2"',
          ),
        ),
      ).toBe(412);
    });

    it('refuses the login link to anyone without workforce.resources.link, before the domain is asked', async () => {
      const { records, resources } = setup();
      expect(
        await status(
          records.update(
            as(supervisor),
            'wf.resources',
            RESOURCE_ID,
            { 'platform-user-id': USER_ID },
            '"3"',
          ),
        ),
      ).toBe(403);
      expect(
        await status(
          records.create(
            as(supervisor),
            'wf.resources',
            {
              'reference-code': 'EMP-003',
              'display-name': 'Cy',
              'resource-type': 'HUMAN',
              'platform-user-id': USER_ID,
            },
            randomUUID(),
          ),
        ),
      ).toBe(403);
      expect(resources.updateResource).not.toHaveBeenCalled();
      expect(resources.createResource).not.toHaveBeenCalled();
    });

    it('lets an administrator link a login, change it and clear it', async () => {
      const { records, resources } = setup();
      expect(
        await records.update(
          as(admin),
          'wf.resources',
          RESOURCE_ID,
          { 'platform-user-id': USER_ID },
          '"3"',
        ),
      ).toMatchObject({ 'platform-user-id': USER_ID });
      expect(resources.updateResource).toHaveBeenLastCalledWith(expect.anything(), RESOURCE_ID, {
        platformUserId: USER_ID,
        expectedVersion: 3,
      });
      await records.update(
        as(admin),
        'wf.resources',
        RESOURCE_ID,
        { 'platform-user-id': null },
        '"4"',
      );
      expect(resources.updateResource).toHaveBeenLastCalledWith(expect.anything(), RESOURCE_ID, {
        platformUserId: null,
        expectedVersion: 4,
      });
    });

    it('deactivates with the version the screen read and keeps the reason; without a version it is refused', async () => {
      const { records, resources } = setup();
      const result = await records.action(
        as(supervisor),
        'wf.resources',
        RESOURCE_ID,
        'deactivate',
        { reason: 'Left the company', expectedVersion: 3 },
        randomUUID(),
      );
      expect(result).toMatchObject({ status: 'INACTIVE', version: 4 });
      expect(resources.updateResource).toHaveBeenLastCalledWith(
        { principal: supervisor, correlationId: 'correlation-1' },
        RESOURCE_ID,
        { status: 'INACTIVE', expectedVersion: 3, reason: 'Left the company' },
      );
      expect(
        await status(
          records.action(
            as(supervisor),
            'wf.resources',
            RESOURCE_ID,
            'activate',
            { expectedVersion: 3 },
            randomUUID(),
          ),
        ),
      ).toBe(412);
      expect(
        await status(
          records.action(as(supervisor), 'wf.resources', RESOURCE_ID, 'activate', {}, randomUUID()),
        ),
      ).toBe(400);
    });

    it('lets a member read people but not change them', async () => {
      const { records } = setup();
      expect((await records.get(member, 'wf.resources', RESOURCE_ID))['display-name']).toBe(
        'Alice Engineer',
      );
      expect(
        await status(
          records.update(as(member), 'wf.resources', RESOURCE_ID, { 'display-name': 'X' }, '"3"'),
        ),
      ).toBe(403);
      expect(
        await status(
          records.action(
            as(member),
            'wf.resources',
            RESOURCE_ID,
            'deactivate',
            { reason: 'x', expectedVersion: 3 },
            randomUUID(),
          ),
        ),
      ).toBe(403);
    });

    it('answers a repeated create with the same key once', async () => {
      const { records, resources } = setup();
      const key = randomUUID();
      const body = { 'reference-code': 'EMP-004', 'display-name': 'Di', 'resource-type': 'HUMAN' };
      await records.create(as(supervisor), 'wf.resources', body, key);
      await records.create(as(supervisor), 'wf.resources', body, key);
      expect(resources.createResource).toHaveBeenCalledTimes(1);
    });
  });

  describe('Skills (child tab of People)', () => {
    it('lists the skills of one person, with dates as the window shows them', async () => {
      const { records } = setup();
      const page = await records.list(supervisor, 'wf.resource-skills', { parentId: RESOURCE_ID });
      expect(page.total).toBe(1);
      expect(page.items[0]).toMatchObject({
        'capability-definition-id': CAPABILITY_ID,
        'valid-from': '2026-01-01',
        'expires-at': '2027-01-01',
        proficiency: 'ADVANCED',
      });
    });

    it('assigns a skill as the child tab sends it (parent link fixed, dates as days)', async () => {
      const { records, resources } = setup();
      await records.create(
        as(supervisor),
        'wf.resource-skills',
        {
          'resource-id': RESOURCE_ID,
          'capability-definition-id': CAPABILITY_ID,
          proficiency: 'EXPERT',
          'valid-from': '2026-10-13',
          'expires-at': '2028-10-13',
        },
        randomUUID(),
      );
      expect(resources.assignCapability).toHaveBeenCalledWith(
        expect.objectContaining({ principal: supervisor }),
        RESOURCE_ID,
        {
          capabilityDefinitionId: CAPABILITY_ID,
          proficiency: 'EXPERT',
          validFrom: '2026-10-13T00:00:00.000Z',
          expiresAt: '2028-10-13T00:00:00.000Z',
        },
      );
    });

    it('requires the skill and its start date', async () => {
      const { records, resources } = setup();
      expect(
        await status(
          records.create(
            as(supervisor),
            'wf.resource-skills',
            { 'resource-id': RESOURCE_ID, 'valid-from': '2026-10-13' },
            randomUUID(),
          ),
        ),
      ).toBe(422);
      expect(
        await status(
          records.create(
            as(supervisor),
            'wf.resource-skills',
            { 'resource-id': RESOURCE_ID, 'capability-definition-id': CAPABILITY_ID },
            randomUUID(),
          ),
        ),
      ).toBe(422);
      expect(resources.assignCapability).not.toHaveBeenCalled();
    });
  });

  describe('Job profiles and positions (window held back; adapters kept)', () => {
    it('pages and sorts the whole list the domain returns', async () => {
      const { records } = setup();
      const page = await records.list(supervisor, 'wf.job-profiles', {
        page: '1',
        pageSize: '2',
        sort: 'code',
      });
      expect(page.total).toBe(3);
      expect(page.items.map((item) => item.code)).toEqual(['AA-FIRST', 'SR-MECH']);
      expect(
        (
          await records.list(supervisor, 'wf.job-profiles', {
            page: '2',
            pageSize: '2',
            sort: 'code',
          })
        ).items.map((item) => item.code),
      ).toEqual(['ZZ-LAST']);
    });

    it('deactivates a profile with the version read and the reason', async () => {
      const { records, jobs } = setup();
      await records.action(
        as(supervisor),
        'wf.job-profiles',
        PROFILE_ID,
        'deactivate',
        { reason: 'Role retired', expectedVersion: 2 },
        randomUUID(),
      );
      expect(jobs.setProfileStatus).toHaveBeenCalledWith(expect.anything(), PROFILE_ID, {
        status: 'INACTIVE',
        expectedVersion: 2,
        reason: 'Role retired',
      });
    });

    it('creates a position with dates as days and the FTE as a number', async () => {
      const { records, jobs } = setup();
      await records.create(
        as(supervisor),
        'wf.positions',
        {
          'job-profile-id': PROFILE_ID,
          code: 'POS-002',
          fte: '0.50',
          'effective-from': '2026-11-01',
        },
        randomUUID(),
      );
      expect(jobs.createPosition).toHaveBeenCalledWith(expect.anything(), {
        jobProfileId: PROFILE_ID,
        code: 'POS-002',
        fte: 0.5,
        effectiveFrom: '2026-11-01',
      });
    });
  });

  describe('Pickers', () => {
    it('offers active skills by search and names any skill by id', async () => {
      const { records } = setup();
      expect(await records.lookup(supervisor, 'wf-capabilities', { search: 'mech' })).toEqual([
        { value: CAPABILITY_ID, label: 'Mechanical level 2 (MECH-2)' },
      ]);
      expect(await records.lookup(supervisor, 'wf-capabilities', { search: 'retired' })).toEqual(
        [],
      );
      expect(
        await records.lookup(supervisor, 'wf-capabilities', { ids: RETIRED_CAPABILITY_ID }),
      ).toEqual([{ value: RETIRED_CAPABILITY_ID, label: 'Retired skill (OLD-1)' }]);
    });

    it('finds people by search or id in the database', async () => {
      const { records, resources } = setup();
      expect(await records.lookup(supervisor, 'wf-resources', { ids: RESOURCE_ID })).toEqual([
        { value: RESOURCE_ID, label: 'Alice Engineer (EMP-001)' },
      ]);
      expect(resources.lookupResources).toHaveBeenCalledWith(supervisor, {
        ids: [RESOURCE_ID],
        limit: 50,
      });
    });

    it('names job profiles by their current title', async () => {
      const { records } = setup();
      expect(await records.lookup(supervisor, 'wf-jobs', { ids: PROFILE_ID })).toEqual([
        { value: PROFILE_ID, label: 'Title SR-MECH (SR-MECH)' },
      ]);
    });
  });
});
