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
  type LookupOption,
  type LookupResolver,
  type ModulePrincipal,
  type RecordAdapter,
  type RecordCommandContext,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordPage,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import type { JobsService } from '../jobs/jobs.service.js';
import type { WorkforceResourcesService } from './workforce-resources.service.js';

// WI-OI-120u (M-WF1, ADR-0033 D1): Workforce record adapters behind metadata windows, over the existing domain services.
// Window field keys are the dictionary's kebab-case keys; the domain speaks camelCase. The services still decide: a
// login can be linked only by a holder of workforce.resources.link (WI-OI-120n), which the window and the dispatcher
// also require of the field.

const camel = (key: string) =>
  key.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

/** The record controller sits behind GigaOpsAuthorizationGuard, so the principal it passes is the Workforce one. */
const domain = (principal: ModulePrincipal) => principal as unknown as GigaOpsPrincipal;

const command = (context: RecordCommandContext) => ({
  principal: domain(context.principal),
  correlationId: context.correlationId,
});

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
  readonly writePermission?: string;
  /** A value the domain may clear (null); other empty values are left out of a change. */
  readonly clearable?: boolean;
  readonly domain?: string;
  readonly toDomain?: (value: unknown) => unknown;
  readonly toWindow?: (value: unknown) => unknown;
}

/** A window DATE (YYYY-MM-DD) for a domain timestamp, and back. */
const DATE_AS_TIMESTAMP: Pick<FieldSpec, 'toDomain' | 'toWindow'> = {
  toDomain: (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value,
  toWindow: (value) => (typeof value === 'string' ? value.slice(0, 10) : value),
};

const domainName = (field: FieldSpec) => field.domain ?? camel(field.key);

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      {
        writable: field.writable ?? false,
        ...(field.writePermission ? { writePermission: field.writePermission } : {}),
      },
    ]),
  );
}

function toWindow(fields: readonly FieldSpec[], record: object): RecordValues {
  const source = record as Record<string, unknown>;
  const values: Record<string, unknown> = { id: source.id };
  if (source.version !== undefined) values.version = source.version;
  for (const field of fields) {
    const raw = source[domainName(field)];
    values[field.key] =
      raw === undefined || raw === null ? null : field.toWindow ? field.toWindow(raw) : raw;
  }
  return values;
}

function toDomain(fields: readonly FieldSpec[], values: RecordValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.writable || !(field.key in values)) continue;
    const value = values[field.key];
    if (value === null || value === '') {
      if (field.clearable) input[domainName(field)] = null;
      continue;
    }
    input[domainName(field)] = field.toDomain ? field.toDomain(value) : value;
  }
  return input;
}

/** A Workforce version conflict (409) becomes the window's 412 ("someone else changed this record"). */
async function versioned<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof ConflictException
        ? (error.getResponse() as { code?: unknown }).code
        : undefined;
    if (code === 'WORKFORCE_RESOURCE_VERSION_CONFLICT' || code === 'WORKFORCE_VERSION_CONFLICT')
      throw new RecordVersionConflict();
    throw error;
  }
}

async function orNull<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundException) return null;
    throw error;
  }
}

/** The version the screen read, which every action carries (WI-OI-120g); without it the action is refused. */
function expectedVersion(parameters: RecordValues): number {
  const version = parameters.expectedVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BadRequestException({
      code: 'WORKFORCE_VALIDATION_FAILED',
      message: 'The action needs the version of the record you read.',
    });
  }
  return version;
}

const reasonOf = (parameters: RecordValues) =>
  typeof parameters.reason === 'string' && parameters.reason.trim()
    ? { reason: parameters.reason.trim() }
    : {};

/** One page of a list the domain returns whole. */
function pageOf(items: readonly RecordValues[], query: RecordListQuery): RecordPage {
  const start = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(start, start + query.pageSize),
    total: items.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export interface WorkforceRecordDependencies {
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
    entityKey: 'wf.resource-skills',
    permissions: { read: 'workforce.capabilities.read', create: 'workforce.capabilities.manage' },
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
    entityKey: 'wf.positions',
    permissions: {
      read: 'workforce.jobs.read',
      create: 'workforce.jobs.manage',
      update: 'workforce.jobs.manage',
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

type LookupRequest = {
  readonly search?: string;
  readonly ids?: readonly string[];
  readonly limit: number;
};

/** Options matching the search, or the ones named by id (to show the names of values a record already holds). */
function pick<T>(
  items: readonly T[],
  request: LookupRequest,
  option: (item: T) => LookupOption & { readonly active: boolean },
): LookupOption[] {
  const options = items.map(option);
  const named = new Set(request.ids ?? []);
  if (named.size > 0)
    return options
      .filter((candidate) => named.has(candidate.value))
      .map(({ value, label }) => ({ value, label }));
  const search = request.search?.toLowerCase();
  return options
    .filter(
      (candidate) =>
        candidate.active && (!search || candidate.label.toLowerCase().includes(search)),
    )
    .slice(0, request.limit)
    .map(({ value, label }) => ({ value, label }));
}

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
    [resourceAdapter(deps), skillAdapter(deps), jobProfileAdapter(deps), positionAdapter(deps)],
    [resourceLookup(deps), capabilityLookup(deps), jobProfileLookup(deps)],
    idempotency,
    // WI-OI-120r (S1): the field rules of Workforce's windows, enforced on every create and change.
    shippedRecordRules('gigaops'),
  );
}
