import { shippedRecordRules } from '@gigalibs/configuration-core';
import type {
  CapabilityDefinitionV1,
  JobProfileV1,
  PositionV1,
  ResourceQualificationV1,
  WorkforceResourceV1,
} from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  type LookupResolver,
  type RecordAdapter,
  type RecordCommandContext,
  RecordDispatcher,
  type RecordValues,
} from '@gigalibs/module-sdk';
import { BadRequestException } from '@nestjs/common';
import {
  type AvailabilityRecordDependencies,
  availabilityAdapters,
  availabilityLookups,
} from '../availability/availability-record-adapters.js';
import {
  domain,
  DATE_AS_TIMESTAMP,
  type FieldSpec,
  command,
  expectedVersion,
  fieldPolicies,
  orNull,
  pageOf,
  pick,
  reasonOf,
  toDomain,
  toWindow,
  versioned,
} from '../common/record-kit.js';
import type { JobsService } from '../jobs/jobs.service.js';
import type { WorkforceResourcesService } from './workforce-resources.service.js';

// WI-OI-120u (M-WF1, ADR-0033 D1): Workforce record adapters behind metadata windows, over the existing domain services
// (shared helpers in common/record-kit.ts). The services still decide: a
// login can be linked only by a holder of workforce.resources.link (WI-OI-120n), which the window and the dispatcher
// also require of the field.

export interface WorkforceRecordDependencies extends AvailabilityRecordDependencies {
  readonly resources: WorkforceResourcesService;
  readonly jobs: JobsService;
}

// ─── People (resources) ──────────────────────────────────────────────────────

const RESOURCE_FIELDS: readonly FieldSpec[] = [
  { key: 'reference-code', writable: true },
  { key: 'display-name', writable: true },
  { key: 'resource-type', writable: true },
  {
    key: 'platform-user-id',
    writable: true,
    writePermission: 'workforce.resources.link',
    clearable: true,
  },
  { key: 'status' },
  { key: 'qualification-count' },
  { key: 'created-at' },
  { key: 'updated-at' },
];

function resourceAdapter(deps: WorkforceRecordDependencies): RecordAdapter {
  const setStatus = (status: 'ACTIVE' | 'INACTIVE') => ({
    permission: 'workforce.resources.manage',
    run: async (context: RecordCommandContext, id: string, parameters: RecordValues) =>
      toWindow(
        RESOURCE_FIELDS,
        await versioned(() =>
          deps.resources.updateResource(command(context), id, {
            status,
            expectedVersion: expectedVersion(parameters),
            ...reasonOf(parameters),
          }),
        ),
      ),
  });
  return {
    rest: {
      read: 'GET v1/resources',
      create: 'POST v1/resources',
      update: 'PATCH v1/resources/{id}',
      actions: { deactivate: 'PATCH v1/resources/{id}', activate: 'PATCH v1/resources/{id}' },
    },
    entityKey: 'wf.resources',
    permissions: {
      read: 'workforce.resources.read',
      create: 'workforce.resources.manage',
      update: 'workforce.resources.manage',
    },
    fields: fieldPolicies(RESOURCE_FIELDS),
    searchFields: ['reference-code', 'display-name'],
    // The window opens sorted by name (its default sort); the domain lists by name only.
    sortFields: ['display-name'],
    async list(principal, query) {
      const result = await deps.resources.listResources(domain(principal), {
        page: query.page,
        pageSize: query.pageSize,
        direction: query.sortDirection,
        ...(query.search ? { q: query.search } : {}),
      });
      return {
        items: result.items.map((resource: WorkforceResourceV1) =>
          toWindow(RESOURCE_FIELDS, resource),
        ),
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    async get(principal, id) {
      const detail = await orNull(() => deps.resources.getResource(domain(principal), id));
      return detail ? toWindow(RESOURCE_FIELDS, detail) : null;
    },
    async create(context, values) {
      return toWindow(
        RESOURCE_FIELDS,
        await deps.resources.createResource(command(context), toDomain(RESOURCE_FIELDS, values)),
      );
    },
    async update(context, id, values, version) {
      // As Inventory's codes: a reference code is how other records and people find this one, so it does not change.
      if ('reference-code' in values) {
        throw new BadRequestException({
          code: 'WORKFORCE_VALIDATION_FAILED',
          message: 'A reference code cannot change.',
        });
      }
      const input = toDomain(RESOURCE_FIELDS, values);
      return toWindow(
        RESOURCE_FIELDS,
        await versioned(() =>
          deps.resources.updateResource(command(context), id, {
            ...input,
            expectedVersion: version,
          }),
        ),
      );
    },
    actions: { deactivate: setStatus('INACTIVE'), activate: setStatus('ACTIVE') },
  };
}

// ─── Skills (a person's qualifications), a child tab of People ───────────────

const SKILL_FIELDS: readonly FieldSpec[] = [
  { key: 'resource-id', writable: true },
  { key: 'capability-definition-id', writable: true },
  { key: 'proficiency', writable: true },
  { key: 'status' },
  { key: 'valid-from', writable: true, ...DATE_AS_TIMESTAMP },
  { key: 'expires-at', writable: true, ...DATE_AS_TIMESTAMP },
  { key: 'issuing-authority', writable: true },
  { key: 'evidence-reference', writable: true },
  { key: 'created-at' },
];

function skillAdapter(deps: WorkforceRecordDependencies): RecordAdapter {
  return {
    rest: { read: 'GET v1/resources/{id}', create: 'POST v1/resources/{id}/capabilities' },
    entityKey: 'wf.resource-skills',
    // Security review L1: a person's qualifications are part of their record, which REST shows to holders of
    // workforce.resources.read (GET v1/resources/:id); reading skills needs it as well as the skills permission.
    // WI-OI-120af: declared here, so the dispatcher enforces it and the conversion check sees it.
    permissions: {
      read: ['workforce.capabilities.read', 'workforce.resources.read'],
      create: 'workforce.capabilities.manage',
    },
    parentField: 'resource-id',
    fields: fieldPolicies(SKILL_FIELDS),
    async list(principal, query) {
      // Skills are always listed under their person; the person's record carries them.
      const parentId = query.parentId;
      if (!parentId) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
      const detail = await orNull(() => deps.resources.getResource(domain(principal), parentId));
      return pageOf(
        (detail?.qualifications ?? []).map((qualification: ResourceQualificationV1) =>
          toWindow(SKILL_FIELDS, qualification),
        ),
        query,
      );
    },
    async get() {
      // A skill is read in its person's tab; it has no page of its own.
      return null;
    },
    async create(context, values) {
      const resourceId = values['resource-id'];
      if (typeof resourceId !== 'string') {
        throw new BadRequestException({
          code: 'WORKFORCE_VALIDATION_FAILED',
          message: 'Choose the person this skill belongs to.',
        });
      }
      const { resourceId: _parent, ...input } = toDomain(SKILL_FIELDS, values);
      return toWindow(
        SKILL_FIELDS,
        await deps.resources.assignCapability(command(context), resourceId, input),
      );
    },
  };
}

// ─── Job profiles and positions (their window is held back; see dictionary/jobs-window.held.mjs) ─────

const JOB_PROFILE_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'status' },
  { key: 'title', writable: true },
  { key: 'description', writable: true },
  { key: 'worker-category', writable: true },
  { key: 'position-count' },
  { key: 'created-at' },
  { key: 'updated-at' },
];

/** A job profile's current revision carries its title, description and worker category. */
function profileToWindow(profile: JobProfileV1): RecordValues {
  const source = profile as unknown as Record<string, unknown> & {
    current?: Record<string, unknown> | null;
  };
  return {
    id: profile.id,
    version: profile.version,
    code: profile.code,
    status: profile.status,
    title: source.current?.title ?? null,
    description: source.current?.description ?? null,
    'worker-category': source.current?.workerCategory ?? null,
    'position-count': source.positionCount ?? 0,
    'created-at': source.createdAt ?? null,
    'updated-at': source.updatedAt ?? null,
  };
}

function jobProfileAdapter(deps: WorkforceRecordDependencies): RecordAdapter {
  const setStatus = (status: 'ACTIVE' | 'INACTIVE') => ({
    permission: 'workforce.jobs.manage',
    run: async (context: RecordCommandContext, id: string, parameters: RecordValues) =>
      profileToWindow(
        await versioned(() =>
          deps.jobs.setProfileStatus(command(context), id, {
            status,
            expectedVersion: expectedVersion(parameters),
            ...reasonOf(parameters),
          }),
        ),
      ),
  });
  return {
    rest: {
      read: 'GET v1/job-profiles',
      create: 'POST v1/job-profiles',
      actions: { deactivate: 'PATCH v1/job-profiles/{id}', activate: 'PATCH v1/job-profiles/{id}' },
    },
    entityKey: 'wf.job-profiles',
    permissions: { read: 'workforce.jobs.read', create: 'workforce.jobs.manage' },
    fields: fieldPolicies(JOB_PROFILE_FIELDS),
    searchFields: ['code', 'title'],
    sortFields: ['code'],
    async list(principal, query) {
      const result = await deps.jobs.listProfiles(
        domain(principal),
        query.search ? { q: query.search } : {},
      );
      const byCode = [...result.items].sort(
        (a, b) => a.code.localeCompare(b.code) * (query.sortDirection === 'DESC' ? -1 : 1),
      );
      return pageOf(byCode.map(profileToWindow), query);
    },
    async get(principal, id) {
      const detail = await orNull(() => deps.jobs.getProfile(domain(principal), id));
      return detail ? profileToWindow(detail) : null;
    },
    async create(context, values) {
      const input: Record<string, unknown> = {
        code: values.code,
        title: values.title,
        workerCategory: values['worker-category'],
        effectiveFrom: new Date().toISOString().slice(0, 10),
      };
      if (typeof values.description === 'string' && values.description)
        input.description = values.description;
      return profileToWindow(await deps.jobs.createProfile(command(context), input));
    },
    actions: { deactivate: setStatus('INACTIVE'), activate: setStatus('ACTIVE') },
  };
}

const POSITION_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'job-profile-id', writable: true },
  { key: 'title' },
  { key: 'site-ref', writable: true, clearable: true },
  { key: 'organization-unit-id', writable: true, clearable: true },
  // An exact NUMBER travels as a decimal string; the domain takes a number.
  {
    key: 'fte',
    writable: true,
    toDomain: (value) => (typeof value === 'string' ? Number(value) : value),
  },
  // Positions are dated in the domain too (YYYY-MM-DD), so dates pass as they are.
  { key: 'effective-from', writable: true },
  { key: 'effective-to', writable: true, clearable: true },
  { key: 'status' },
  { key: 'created-at' },
];

function positionAdapter(deps: WorkforceRecordDependencies): RecordAdapter {
  return {
    rest: {
      read: 'GET v1/positions',
      create: 'POST v1/positions',
      update: 'PATCH v1/positions/{id}',
    },
    entityKey: 'wf.positions',
    // As REST v1/positions (security review M1): positions have their own permissions, not the job profiles'.
    permissions: {
      read: 'workforce.positions.read',
      create: 'workforce.positions.manage',
      update: 'workforce.positions.manage',
    },
    parentField: 'job-profile-id',
    fields: fieldPolicies(POSITION_FIELDS),
    async list(principal, query) {
      const result = await deps.jobs.listPositions(
        domain(principal),
        query.parentId ? { jobProfileId: query.parentId } : {},
      );
      return pageOf(
        result.items.map((position: PositionV1) => toWindow(POSITION_FIELDS, position)),
        query,
      );
    },
    async get(principal, id) {
      const detail = await orNull(() => deps.jobs.getPosition(domain(principal), id));
      return detail ? toWindow(POSITION_FIELDS, detail) : null;
    },
    async create(context, values) {
      return toWindow(
        POSITION_FIELDS,
        await deps.jobs.createPosition(command(context), toDomain(POSITION_FIELDS, values)),
      );
    },
    async update(context, id, values, version) {
      const input = toDomain(POSITION_FIELDS, values);
      return toWindow(
        POSITION_FIELDS,
        await versioned(() =>
          deps.jobs.updatePosition(command(context), id, { ...input, expectedVersion: version }),
        ),
      );
    },
  };
}

// ─── Pickers ─────────────────────────────────────────────────────────────────

function resourceLookup(deps: WorkforceRecordDependencies): LookupResolver {
  return {
    key: 'wf-resources',
    permission: 'workforce.resources.read',
    async resolve(principal, request) {
      const resources = await deps.resources.lookupResources(domain(principal), request);
      return resources.map((resource) => ({
        value: resource.id,
        label: `${resource.displayName} (${resource.referenceCode})`,
      }));
    },
  };
}

function capabilityLookup(deps: WorkforceRecordDependencies): LookupResolver {
  return {
    key: 'wf-capabilities',
    permission: 'workforce.capabilities.read',
    async resolve(principal, request) {
      const { items } = await deps.resources.listCapabilityDefinitions(domain(principal));
      return pick(items, request, (definition: CapabilityDefinitionV1) => ({
        value: definition.id,
        label: `${definition.name} (${definition.code})`,
        active: definition.status === 'ACTIVE',
      }));
    },
  };
}

function jobProfileLookup(deps: WorkforceRecordDependencies): LookupResolver {
  return {
    key: 'wf-jobs',
    permission: 'workforce.jobs.read',
    async resolve(principal, request) {
      const { items } = await deps.jobs.listProfiles(domain(principal), {});
      return pick(items, request, (profile: JobProfileV1) => {
        const title = (profile as unknown as { current?: { title?: string } | null }).current
          ?.title;
        return {
          value: profile.id,
          label: `${title ?? profile.code} (${profile.code})`,
          active: profile.status === 'ACTIVE',
        };
      });
    },
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/** Workforce's record dispatcher. Idempotency-Key answers are kept in the module's `record_idempotency` table. */
export function workforceRecordDispatcher(
  deps: WorkforceRecordDependencies,
  idempotency: IdempotencyStore,
): RecordDispatcher {
  return new RecordDispatcher(
    [
      resourceAdapter(deps),
      skillAdapter(deps),
      jobProfileAdapter(deps),
      positionAdapter(deps),
      ...availabilityAdapters(deps),
    ],
    [
      resourceLookup(deps),
      capabilityLookup(deps),
      jobProfileLookup(deps),
      ...availabilityLookups(deps),
    ],
    idempotency,
    // WI-OI-120r (S1): the field rules of Workforce's windows, enforced on every create and change.
    shippedRecordRules('gigaops'),
  );
}
