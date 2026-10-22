import { shippedRecordRules } from '@gigalibs/configuration-core';
import {
  ArchiveSpeedProjectInputV1Schema,
  CreateSpeedProjectInputV1Schema,
  CreateSpeedRouteInputV1Schema,
  CreateSpeedSubstanceInputV1Schema,
  PutSpeedCriteriaSetInForceInputV1Schema,
  PutSpeedLibrarySetInForceInputV1Schema,
  SpeedArchiveInputV1Schema,
  type SpeedCriteriaSetV1,
  type SpeedLibrarySetV1,
  type SpeedProjectStatus,
  type SpeedProjectV1,
  type SpeedRouteV1,
  type SpeedSubstanceV1,
} from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  type LookupResolver,
  type RecordAdapter,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MODULE_KEY } from '../config.js';
import type { CriteriaService } from '../criteria/criteria.service.js';
import type { LibraryService } from '../library/library.service.js';
import type { RoutesService } from '../routes/routes.service.js';
import type { SubstancesService } from '../substances/substances.service.js';
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
  readonly criteria: CriteriaService;
  readonly library: LibraryService;
  readonly projects: ProjectsService;
  readonly substances: SubstancesService;
  readonly routes: RoutesService;
}

const SUBSTANCE_FIELDS: Readonly<Record<string, RecordFieldPolicy>> = {
  name: writable,
  'cas-number': writable,
  formula: writable,
  'density-g-per-ml': writable,
  notes: writable,
  'library-material-id': writable,
  'hill-formula': derived,
  'molar-mass-g-per-mol': derived,
  'elements-version': derived,
  'in-use': derived,
  status: derived,
  'updated-at': derived,
};

function substanceToWindow(substance: SpeedSubstanceV1): RecordValues {
  return {
    id: substance.id,
    version: substance.version,
    name: substance.name,
    'cas-number': substance.casNumber,
    formula: substance.formula,
    'density-g-per-ml': substance.densityGPerMl,
    notes: substance.notes,
    'library-material-id': substance.libraryMaterialId,
    'hill-formula': substance.hillFormula,
    'molar-mass-g-per-mol': substance.molarMassGPerMol,
    'elements-version': substance.elementsVersion,
    'in-use': substance.inUse,
    status: substance.status,
    'updated-at': substance.updatedAt,
  };
}

const ROUTE_FIELDS: Readonly<Record<string, RecordFieldPolicy>> = {
  'project-id': writable,
  name: writable,
  'route-version': derived,
  status: derived,
  'author-subject': derived,
  'step-count': derived,
  'steps-passing-gate': derived,
  'updated-at': derived,
};

function routeToWindow(route: SpeedRouteV1): RecordValues {
  return {
    id: route.id,
    version: route.version,
    'project-id': route.projectId,
    name: route.name,
    'route-version': route.routeVersion,
    status: route.status,
    'author-subject': route.authorSubject,
    'step-count': route.stepCount,
    'steps-passing-gate': route.stepsPassingGate,
    'updated-at': route.updatedAt,
  };
}

function libraryToWindow(set: SpeedLibrarySetV1): RecordValues {
  return {
    id: set.id,
    version: set.version,
    'version-label': set.versionLabel,
    source: set.source,
    'review-status': set.reviewStatus,
    'in-force': set.inForce,
    'imported-by': set.importedBy,
    'imported-at': set.importedAt,
    'in-force-since': set.inForceSince,
  };
}

function criteriaToWindow(set: SpeedCriteriaSetV1): RecordValues {
  return {
    id: set.id,
    version: set.version,
    'version-label': set.versionLabel,
    source: set.source,
    'review-status': set.reviewStatus,
    'in-force': set.inForce,
    'imported-by': set.importedBy,
    'imported-at': set.importedAt,
    'in-force-since': set.inForceSince,
  };
}

/** A not-found record is null for the dispatcher, which answers 404 itself. */
async function orNull<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundException) return null;
    throw error;
  }
}

function requestKey(key: string | undefined): string {
  if (!key)
    throw new BadRequestException({
      code: 'SPEED_VALIDATION_FAILED',
      message: 'Idempotency-Key is required.',
    });
  return key;
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

  // Substances are shared across the workspace's sites. A saved substance changes through the API with a reason until
  // S2 brings the window's reason-for-change.
  const substances: RecordAdapter = {
    entityKey: 'speed.substances',
    permissions: { read: READ, create: 'speed.substances.write' },
    rest: {
      read: 'GET v1/substances',
      create: 'POST v1/substances',
      actions: { archive: 'POST v1/substances/{id}/archive' },
    },
    fields: SUBSTANCE_FIELDS,
    searchFields: ['name', 'cas-number', 'formula'],
    filterFields: ['status'],
    sortFields: ['name', 'updated-at'],
    async list(principal, query) {
      const status = given(query.filters['status']);
      const page = await deps.substances.list(principal, {
        page: query.page,
        pageSize: query.pageSize,
        ...(query.search ? { search: query.search } : {}),
        ...(status === 'ACTIVE' || status === 'ARCHIVED' ? { status } : {}),
        ...(query.sortField
          ? {
              sortField: query.sortField === 'updated-at' ? 'updatedAt' : 'name',
              sortDirection: query.sortDirection,
            }
          : {}),
      });
      return {
        items: page.items.map(substanceToWindow),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      };
    },
    async get(principal, id) {
      const found = await orNull(() => deps.substances.get(principal, id));
      return found ? substanceToWindow(found) : null;
    },
    async create(context, values) {
      const input = errors.parseInput(CreateSpeedSubstanceInputV1Schema, {
        requestKey: requestKey(context.idempotencyKey),
        name: values['name'],
        casNumber: given(values['cas-number']),
        formula: values['formula'],
        densityGPerMl: given(values['density-g-per-ml']),
        notes: given(values['notes']),
        libraryMaterialId: given(values['library-material-id']),
      });
      return substanceToWindow((await deps.substances.create(context, input)).substance);
    },
    actions: {
      archive: {
        permission: 'speed.substances.write',
        async run(context, id, parameters) {
          const input = errors.parseInput(SpeedArchiveInputV1Schema, {
            version: parameters['expectedVersion'],
            reason: parameters['reason'],
          });
          return substanceToWindow(
            await versioned(() => deps.substances.archive(context, id, input)),
          );
        },
      },
    },
  };

  // Routes: the list, the record a route's workbench panels are drawn for, and the Projects window's "Routes" tab. The
  // route's content changes through the workbench panel, which sends a reason with every change.
  const routes: RecordAdapter = {
    entityKey: 'speed.routes',
    permissions: { read: READ, create: WRITE },
    rest: {
      read: 'GET v1/routes',
      create: 'POST v1/routes',
      actions: { archive: 'POST v1/routes/{id}/archive' },
    },
    fields: ROUTE_FIELDS,
    searchFields: ['name'],
    filterFields: ['status', 'project-id'],
    sortFields: ['name', 'updated-at'],
    parentField: 'project-id',
    async list(principal, query) {
      const status = given(query.filters['status']);
      const project = given(query.parentId ?? query.filters['project-id']);
      const page = await deps.routes.list(principal, {
        page: query.page,
        pageSize: query.pageSize,
        ...(query.search ? { search: query.search } : {}),
        ...(status === 'DRAFT' || status === 'ARCHIVED' ? { status } : {}),
        ...(typeof project === 'string' ? { projectId: project } : {}),
        ...(query.sortField
          ? {
              sortField: query.sortField === 'updated-at' ? 'updatedAt' : 'name',
              sortDirection: query.sortDirection,
            }
          : {}),
      });
      return {
        items: page.items.map(routeToWindow),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      };
    },
    async get(principal, id) {
      const found = await orNull(() => deps.routes.get(principal, id));
      return found ? routeToWindow(found) : null;
    },
    async create(context, values) {
      const input = errors.parseInput(CreateSpeedRouteInputV1Schema, {
        requestKey: requestKey(context.idempotencyKey),
        projectId: values['project-id'],
        name: values['name'],
      });
      return routeToWindow((await deps.routes.create(context, input)).route);
    },
    actions: {
      archive: {
        permission: WRITE,
        async run(context, id, parameters) {
          const input = errors.parseInput(SpeedArchiveInputV1Schema, {
            version: parameters['expectedVersion'],
            reason: parameters['reason'],
          });
          return routeToWindow(await versioned(() => deps.routes.archive(context, id, input)));
        },
      },
    },
  };

  // Screening criteria sets (§3.2): read-only records; putting one in force is the administrator's action, with a reason.
  const criteriaSets: RecordAdapter = {
    entityKey: 'speed.criteria-sets',
    permissions: { read: READ },
    rest: {
      read: 'GET v1/criteria-sets',
      actions: { 'put-in-force': 'POST v1/criteria-sets/{id}/put-in-force' },
    },
    fields: {
      'version-label': derived,
      source: derived,
      'review-status': derived,
      'in-force': derived,
      'imported-by': derived,
      'imported-at': derived,
      'in-force-since': derived,
    },
    searchFields: ['version-label'],
    sortFields: ['version-label'],
    async list(principal, query) {
      const all = (await deps.criteria.list(principal)).items.filter(
        (set) =>
          !query.search ||
          set.versionLabel
            .toLocaleLowerCase('en-US')
            .includes(query.search.toLocaleLowerCase('en-US')),
      );
      const start = (query.page - 1) * query.pageSize;
      return {
        items: all.slice(start, start + query.pageSize).map(criteriaToWindow),
        total: all.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    async get(principal, id) {
      const found = await orNull(() => deps.criteria.get(principal, id));
      return found ? criteriaToWindow(found) : null;
    },
    actions: {
      'put-in-force': {
        permission: 'speed.settings.manage',
        async run(context, id, parameters) {
          const input = errors.parseInput(PutSpeedCriteriaSetInForceInputV1Schema, {
            version: parameters['expectedVersion'],
            reason: parameters['reason'],
          });
          return criteriaToWindow(
            await versioned(() => deps.criteria.putInForce(context, id, input)),
          );
        },
      },
    },
  };

  // Screening library sets (§3.1): read-only records whose entries a registered panel lists; putting one in force is the
  // administrator's action, with a reason.
  const librarySets: RecordAdapter = {
    entityKey: 'speed.library-sets',
    permissions: { read: READ },
    rest: {
      read: 'GET v1/library-sets',
      actions: { 'put-in-force': 'POST v1/library-sets/{id}/put-in-force' },
    },
    fields: {
      'version-label': derived,
      source: derived,
      'review-status': derived,
      'in-force': derived,
      'imported-by': derived,
      'imported-at': derived,
      'in-force-since': derived,
    },
    searchFields: ['version-label'],
    sortFields: ['version-label'],
    async list(principal, query) {
      const all = (await deps.library.list(principal)).items.filter(
        (set) =>
          !query.search ||
          set.versionLabel
            .toLocaleLowerCase('en-US')
            .includes(query.search.toLocaleLowerCase('en-US')),
      );
      const start = (query.page - 1) * query.pageSize;
      return {
        items: all.slice(start, start + query.pageSize).map(libraryToWindow),
        total: all.length,
        page: query.page,
        pageSize: query.pageSize,
      };
    },
    async get(principal, id) {
      const found = await orNull(() => deps.library.get(principal, id));
      return found ? libraryToWindow(found) : null;
    },
    actions: {
      'put-in-force': {
        permission: 'speed.settings.manage',
        async run(context, id, parameters) {
          const input = errors.parseInput(PutSpeedLibrarySetInForceInputV1Schema, {
            version: parameters['expectedVersion'],
            reason: parameters['reason'],
          });
          return libraryToWindow(
            await versioned(() => deps.library.putInForce(context, id, input)),
          );
        },
      },
    },
  };

  const resolvers: LookupResolver[] = [
    // The library in force's materials, for a substance's link (its reactivity classes come from there).
    {
      key: 'speed-library-materials',
      permission: READ,
      // Values are the pack's own material ids (L01 …), stable across library versions, not row UUIDs (WI-OI-120ce).
      idPattern: /^[A-Za-z0-9][A-Za-z0-9 ._()/+-]{0,63}$/,
      async resolve(principal, request) {
        const set = (await deps.library.list(principal)).items.find(
          (candidate) => candidate.inForce,
        );
        const search = request.search?.toLocaleLowerCase('en-US');
        return (set?.library.materials ?? [])
          .filter((entry) => (request.ids?.length ? request.ids.includes(entry.id) : true))
          .filter(
            (entry) =>
              !search ||
              `${entry.id} ${entry.name ?? ''} ${entry.casNumber ?? ''} ${entry.formula ?? ''}`
                .toLocaleLowerCase('en-US')
                .includes(search),
          )
          .slice(0, request.limit)
          .map((entry) => ({
            value: entry.id,
            label: entry.name ? `${entry.name} (${entry.id})` : entry.id,
          }));
      },
    },
    {
      key: 'speed-projects',
      permission: READ,
      resolve: (principal, request) => deps.projects.lookup(principal, request),
    },
    {
      key: 'speed-substances',
      permission: READ,
      resolve: (principal, request) => deps.substances.lookup(principal, request),
    },
  ];

  return new RecordDispatcher(
    [projects, substances, routes, criteriaSets, librarySets],
    resolvers,
    idempotency,
    // The field rules of SPEED's windows, enforced on every create and change (WI-OI-120r).
    shippedRecordRules(MODULE_KEY),
  );
}
