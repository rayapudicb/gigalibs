import { shippedRecordRules } from '@gigalibs/configuration-core';
import {
  ArchiveSpeedProjectInputV1Schema,
  CreateSpeedProjectInputV1Schema,
  type SpeedProjectStatus,
  type SpeedProjectV1,
} from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  type RecordAdapter,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MODULE_KEY } from '../config.js';
import { type ProjectPageQuery, type ProjectsService, errors } from './projects.service.js';

// WI-OI-120bw (SPEED S3): the record adapters behind SPEED's metadata windows. Window field keys are the dictionary's
// kebab-case keys (`site-unit-id`); every create and action goes through the same contract schema and domain method as
// the module's own API, so the window enforces the same rules: organization scope, idempotency, row versions and a
// reason for every change after creation. Editing a saved project needs a reason, which the window cannot ask for
// until S2's reason-for-change; until then it changes only through the API.

const READ = 'speed.routes.read';
const WRITE = 'speed.routes.write';

const writable: RecordFieldPolicy = { writable: true };
const derived: RecordFieldPolicy = { writable: false };

const PROJECT_FIELDS: Readonly<Record<string, RecordFieldPolicy>> = {
  code: writable,
  name: writable,
  'site-unit-id': writable,
  'owner-subject': writable,
  notes: writable,
  status: derived,
  'created-by': derived,
  'created-at': derived,
  'updated-at': derived,
  'archived-at': derived,
};

/** Window sort and filter keys and the list query names they map to. */
const SORTS: Readonly<Record<string, ProjectPageQuery['sortField']>> = {
  code: 'code',
  name: 'name',
  'updated-at': 'updatedAt',
};

function toWindow(project: SpeedProjectV1): RecordValues {
  return {
    id: project.id,
    version: project.version,
    code: project.code,
    name: project.name,
    'site-unit-id': project.siteUnitId,
    'owner-subject': project.ownerSubject,
    notes: project.notes,
    status: project.status,
    'created-by': project.createdBy,
    'created-at': project.createdAt,
    'updated-at': project.updatedAt,
    'archived-at': project.archivedAt,
  };
}

/** An empty window value is an absent one. */
function given(value: unknown): unknown {
  return value === null || value === '' ? undefined : value;
}

/** A stale row version answers 412 through the dispatcher, as an update does. */
async function versioned<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ConflictException) {
      const body = error.getResponse();
      if (
        body &&
        typeof body === 'object' &&
        (body as { code?: unknown }).code === 'SPEED_VERSION_CONFLICT'
      )
        throw new RecordVersionConflict();
    }
    throw error;
  }
}

export interface SpeedRecordDependencies {
  readonly projects: ProjectsService;
}

export function speedRecordDispatcher(
  deps: SpeedRecordDependencies,
  idempotency: IdempotencyStore,
): RecordDispatcher {
  const projects: RecordAdapter = {
    entityKey: 'speed.projects',
    permissions: { read: READ, create: WRITE },
    rest: {
      read: 'GET v1/projects',
      create: 'POST v1/projects',
      actions: { archive: 'POST v1/projects/{id}/archive' },
    },
    fields: PROJECT_FIELDS,
    searchFields: ['code', 'name'],
    filterFields: ['status', 'site-unit-id'],
    sortFields: ['code', 'name', 'updated-at'],
    async list(principal, query) {
      const status = given(query.filters['status']);
      const site = given(query.filters['site-unit-id']);
      const sortField = query.sortField ? SORTS[query.sortField] : undefined;
      const page = await deps.projects.list(principal, {
        page: query.page,
        pageSize: query.pageSize,
        ...(query.search ? { search: query.search } : {}),
        ...(status === 'ACTIVE' || status === 'ARCHIVED'
          ? { status: status as SpeedProjectStatus }
          : {}),
        ...(typeof site === 'string' ? { siteUnitId: site } : {}),
        ...(sortField ? { sortField, sortDirection: query.sortDirection } : {}),
      });
      return {
        items: page.items.map(toWindow),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      };
    },
    async get(principal, id) {
      try {
        return toWindow(await deps.projects.get(principal, id));
      } catch (error) {
        if (error instanceof NotFoundException) return null;
        throw error;
      }
    },
    async create(context, values) {
      if (!context.idempotencyKey)
        throw new BadRequestException({
          code: 'SPEED_VALIDATION_FAILED',
          message: 'Idempotency-Key is required.',
        });
      const input = errors.parseInput(CreateSpeedProjectInputV1Schema, {
        requestKey: context.idempotencyKey,
        code: values['code'],
        name: values['name'],
        siteUnitId: values['site-unit-id'],
        ownerSubject: given(values['owner-subject']),
        notes: given(values['notes']),
      });
      return toWindow((await deps.projects.create(context, input)).project);
    },
    actions: {
      archive: {
        permission: WRITE,
        async run(context, id, parameters) {
          const input = errors.parseInput(ArchiveSpeedProjectInputV1Schema, {
            version: parameters['expectedVersion'],
            reason: parameters['reason'],
          });
          return toWindow(await versioned(() => deps.projects.archive(context, id, input)));
        },
      },
    },
  };

  return new RecordDispatcher(
    [projects],
    [],
    idempotency,
    // The field rules of SPEED's windows, enforced on every create and change (WI-OI-120r).
    shippedRecordRules(MODULE_KEY),
  );
}
