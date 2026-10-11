import { randomUUID } from 'node:crypto';
import {
  ChangeCmmsWorkOrderStatusV1Schema,
  CreateCmmsWorkOrderV1Schema,
  UpdateCmmsWorkOrderV1Schema,
  AddCmmsWorkOrderTaskV1Schema,
  RecordCmmsWorkOrderTaskV1Schema,
  LogCmmsLabourV1Schema,
  IssueCmmsPartV1Schema,
  AddCmmsWorkOrderNoteV1Schema,
  holdsPermission,
  type CmmsWorkOrderDetailV1,
  type CmmsWorkOrderStatusV1,
  type CmmsWorkOrderV1,
} from '@gigalibs/contracts';
import {
  type IdempotencyEntry,
  type IdempotencyStore,
  type LookupOption,
  type LookupResolver,
  type ModulePrincipal,
  type RecordAction,
  type RecordAdapter,
  type RecordCommandContext,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordPage,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { shippedRecordRules } from '@gigalibs/configuration-core';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { WorkOrdersService } from './work-orders.service.js';
import type { AssetsService } from '../assets/assets.service.js';
import type { PartsService } from '../parts/parts.service.js';
import type { RequestsService } from '../requests/requests.service.js';

// WI-OI-120t (M-CM1, ADR-0033 D1): CMMS work-order record adapters behind metadata windows.
// Window field keys are the dictionary's kebab-case keys; the domain speaks camelCase.
// Every create, update and status action goes through WorkOrdersService (no direct table access).
// Technician scope isolation: a holder of cmms.work-orders.execute-own (without cmms.work-orders.write)
// is authorized ONLY on work orders assigned to their own login; others are refused with 403 CMMS_OUT_OF_SCOPE.

const camel = (key: string) => key.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
  readonly domain?: string;
  readonly toDomain?: (value: unknown) => unknown;
  readonly toWindow?: (value: unknown) => unknown;
}

const DATE: Pick<FieldSpec, 'toDomain' | 'toWindow'> = {
  toDomain: (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value),
  toWindow: (value) => (typeof value === 'string' ? value.slice(0, 10) : value),
};

const domainName = (field: FieldSpec) => field.domain ?? camel(field.key);

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(fields.map((field) => [field.key, { writable: field.writable ?? false }]));
}

function toWindow(fields: readonly FieldSpec[], record: any): RecordValues {
  const values: Record<string, unknown> = { id: record.id };
  if (record.version !== undefined) values.version = record.version;
  for (const f of fields) {
    const raw = record[domainName(f)];
    values[f.key] = raw === undefined ? null : f.toWindow ? f.toWindow(raw) : raw;
  }
  return values;
}

function toDomain(fields: readonly FieldSpec[], values: RecordValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const f of fields) {
    if (!(f.key in values)) continue;
    const value = values[f.key];
    if (value === null || value === '') continue;
    input[domainName(f)] = f.toDomain ? f.toDomain(value) : value;
  }
  return input;
}

function domainQuery(query: RecordListQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.search ? { q: query.search } : {}),
    ...(query.sortField ? { sortField: camel(query.sortField) } : {}),
    sortDirection: query.sortDirection,
    ...Object.fromEntries(Object.entries(query.filters).map(([key, value]) => [camel(key), value])),
    ...(query.parentId ? { parentId: query.parentId } : {}),
  };
}

/** Asserts that a technician with execute-own cannot touch another technician's work order. */
export function assertCanExecute(principal: ModulePrincipal, workOrder: CmmsWorkOrderV1 | CmmsWorkOrderDetailV1): void {
  if (holdsPermission(principal.permissions, 'cmms.work-orders.write')) {
    return;
  }
  if (!holdsPermission(principal.permissions, 'cmms.work-orders.execute-own')) {
    throw new ForbiddenException({
      code: 'CMMS_PERMISSION_DENIED',
      message: 'Permission cmms.work-orders.write or cmms.work-orders.execute-own is required.',
    });
  }
  if (!workOrder.assignedTo || workOrder.assignedTo !== principal.subject) {
    throw new ForbiddenException({
      code: 'CMMS_OUT_OF_SCOPE',
      message: 'You can only execute work orders assigned to you.',
    });
  }
}

export interface CmmsRecordDependencies {
  readonly workOrders: WorkOrdersService;
  readonly assets: Pick<AssetsService, 'search'>;
  readonly parts: Pick<PartsService, 'search'>;
  readonly requests?: RequestsService;
}

const WORK_ORDER_FIELDS: readonly FieldSpec[] = [
  { key: 'wo-number' },
  { key: 'title', writable: true },
  { key: 'description', writable: true },
  { key: 'type', writable: true },
  { key: 'priority', writable: true },
  { key: 'status' },
  { key: 'asset-id', writable: true },
  { key: 'assigned-to', writable: true },
  { key: 'due-at', writable: true },
  { key: 'estimated-hours', writable: true },
  { key: 'requires-signature', writable: true },
  { key: 'trigger-source' },
  { key: 'started-at' },
  { key: 'completed-at' },
  { key: 'completion-notes' },
  { key: 'created-by' },
  { key: 'created-at' },
];

const TASK_FIELDS: readonly FieldSpec[] = [
  { key: 'work-order-id', writable: true },
  { key: 'position' },
  { key: 'label', writable: true },
  { key: 'required', writable: true },
  { key: 'status', writable: true },
  { key: 'result-value', writable: true },
  { key: 'notes', writable: true },
  { key: 'completed-by' },
  { key: 'completed-at' },
];

const LABOUR_FIELDS: readonly FieldSpec[] = [
  { key: 'work-order-id', writable: true },
  { key: 'worker-ref', writable: true },
  { key: 'hours', writable: true },
  { key: 'hourly-rate', writable: true },
  { key: 'currency-code', writable: true },
  { key: 'time-category', writable: true },
  { key: 'performed-on', writable: true, ...DATE },
  { key: 'notes', writable: true },
  { key: 'created-at' },
];

const PARTS_FIELDS: readonly FieldSpec[] = [
  { key: 'work-order-id', writable: true },
  { key: 'part-id', writable: true },
  { key: 'part-number' },
  { key: 'part-name' },
  { key: 'quantity', writable: true, domain: 'quantity' },
  { key: 'unit-cost' },
  { key: 'currency-code' },
  { key: 'storeroom-id', writable: true },
  { key: 'bin-location', writable: true },
  { key: 'created-at' },
];

const NOTES_FIELDS: readonly FieldSpec[] = [
  { key: 'work-order-id', writable: true },
  { key: 'body', writable: true },
  { key: 'actor-subject' },
  { key: 'occurred-at' },
];

const HISTORY_FIELDS: readonly FieldSpec[] = [
  { key: 'work-order-id' },
  { key: 'event-type' },
  { key: 'from-status' },
  { key: 'to-status' },
  { key: 'actor-subject' },
  { key: 'occurred-at' },
];

const REQUEST_FIELDS: readonly FieldSpec[] = [
  { key: 'request-number' },
  { key: 'title', writable: true },
  { key: 'description', writable: true },
  { key: 'priority', writable: true },
  { key: 'status' },
  { key: 'asset-id', writable: true },
  { key: 'requester-name', writable: true },
  { key: 'requester-email', writable: true },
  { key: 'requester-phone', writable: true },
  { key: 'requester-subject' },
  { key: 'rejection-reason' },
  { key: 'converted-wo-id' },
  { key: 'triaged-by' },
  { key: 'triaged-at' },
  { key: 'created-at' },
];

async function executeStatusTransition(
  deps: CmmsRecordDependencies,
  context: RecordCommandContext,
  workOrderId: string,
  targetStatus: CmmsWorkOrderStatusV1,
  parameters: RecordValues,
): Promise<RecordValues> {
  const current = await deps.workOrders.get(context.principal as any, workOrderId);
  assertCanExecute(context.principal, current);
  const expectedVersion =
    typeof parameters.expectedVersion === 'number'
      ? parameters.expectedVersion
      : current.version;
  const notes =
    typeof parameters.reason === 'string'
      ? parameters.reason
      : typeof parameters.notes === 'string'
        ? parameters.notes
        : undefined;
  const signatureData =
    typeof parameters.signatureData === 'string'
      ? parameters.signatureData
      : undefined;

  const updated = await deps.workOrders.changeStatus(context as any, workOrderId, {
    status: targetStatus,
    expectedVersion,
    notes,
    signatureData,
  });
  return toWindow(WORK_ORDER_FIELDS, updated);
}

/** CMMS record dispatcher: work orders and their child entities (tasks, labour, parts, notes, history). */
export function cmmsRecordDispatcher(deps: CmmsRecordDependencies, idempotency?: IdempotencyStore): RecordDispatcher {
  const workOrders: RecordAdapter = {
    entityKey: 'cmms.work-orders',
    permissions: {
      read: 'cmms.work-orders.read',
      create: 'cmms.work-orders.write',
      update: 'cmms.work-orders.write',
    },
    fields: fieldPolicies(WORK_ORDER_FIELDS),
    searchFields: ['wo-number', 'title'],
    filterFields: ['status', 'priority', 'type'],
    sortFields: ['wo-number', 'title', 'due-at', 'created-at'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      const page = await deps.workOrders.search(principal as any, domainQuery(query));
      return {
        items: page.items.map((wo) => toWindow(WORK_ORDER_FIELDS, wo)),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      try {
        const wo = await deps.workOrders.get(principal as any, id);
        return toWindow(WORK_ORDER_FIELDS, wo);
      } catch (error) {
        if (error instanceof NotFoundException) return null;
        throw error;
      }
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const domain = toDomain(WORK_ORDER_FIELDS, values);
      const input = {
        requestKey: (values.requestKey as string) || context.idempotencyKey || randomUUID(),
        type: domain.type,
        priority: domain.priority ?? 'MEDIUM',
        title: domain.title,
        description: domain.description,
        assetId: domain.assetId,
        siteRef: domain.siteRef,
        departmentId: domain.departmentId,
        assignedTo: domain.assignedTo,
        dueAt: domain.dueAt,
        requiresSignature: domain.requiresSignature ?? false,
        estimatedHours: domain.estimatedHours,
        tasks: [],
      };
      const created = await deps.workOrders.create(context as any, input);
      return toWindow(WORK_ORDER_FIELDS, created);
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      const domain = toDomain(WORK_ORDER_FIELDS, values);
      const updated = await deps.workOrders.update(context as any, id, {
        ...domain,
        expectedVersion,
      });
      return toWindow(WORK_ORDER_FIELDS, updated);
    },
    actions: {
      start: {
        permission: 'cmms.work-orders.execute-own',
        run: (context, id, params) => executeStatusTransition(deps, context, id, 'IN_PROGRESS', params),
      },
      hold: {
        permission: 'cmms.work-orders.execute-own',
        run: (context, id, params) => executeStatusTransition(deps, context, id, 'ON_HOLD', params),
      },
      resume: {
        permission: 'cmms.work-orders.execute-own',
        run: (context, id, params) => executeStatusTransition(deps, context, id, 'IN_PROGRESS', params),
      },
      complete: {
        permission: 'cmms.work-orders.execute-own',
        run: (context, id, params) => executeStatusTransition(deps, context, id, 'COMPLETED', params),
      },
      cancel: {
        permission: 'cmms.work-orders.execute-own',
        run: (context, id, params) => executeStatusTransition(deps, context, id, 'CANCELLED', params),
      },
    },
  };

  const tasks: RecordAdapter = {
    entityKey: 'cmms.work-order-tasks',
    parentField: 'work-order-id',
    permissions: {
      read: 'cmms.work-orders.read',
      create: 'cmms.work-orders.execute-own',
      update: 'cmms.work-orders.execute-own',
    },
    fields: fieldPolicies(TASK_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const wo = await deps.workOrders.get(principal as any, query.parentId);
      const items = (wo.tasks ?? []).map((task) =>
        toWindow(TASK_FIELDS, { ...task, workOrderId: query.parentId }),
      );
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const workOrderId = values['work-order-id'] as string;
      if (!workOrderId) {
        throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'work-order-id is required' });
      }
      const wo = await deps.workOrders.get(context.principal as any, workOrderId);
      assertCanExecute(context.principal, wo);
      const updated = await deps.workOrders.addTask(context as any, workOrderId, {
        label: values.label as string,
        required: values.required !== false,
      });
      const last = updated.tasks[updated.tasks.length - 1]!;
      return toWindow(TASK_FIELDS, { ...last, workOrderId });
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      const workOrderId = values['work-order-id'] as string;
      if (!workOrderId) {
        throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'work-order-id is required' });
      }
      const wo = await deps.workOrders.get(context.principal as any, workOrderId);
      assertCanExecute(context.principal, wo);
      const updated = await deps.workOrders.recordTask(context as any, workOrderId, id, {
        status: values.status,
        resultValue: values['result-value'] !== null && values['result-value'] !== undefined ? Number(values['result-value']) : null,
        notes: (values.notes as string) || undefined,
        expectedVersion,
      });
      const task = updated.tasks.find((t) => t.id === id);
      return toWindow(TASK_FIELDS, { ...task, workOrderId });
    },
  };

  const labour: RecordAdapter = {
    entityKey: 'cmms.work-order-labour',
    parentField: 'work-order-id',
    permissions: {
      read: 'cmms.work-orders.read',
      create: 'cmms.work-orders.execute-own',
    },
    fields: fieldPolicies(LABOUR_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const wo = await deps.workOrders.get(principal as any, query.parentId);
      const items = (wo.labour ?? []).map((item) =>
        toWindow(LABOUR_FIELDS, { ...item, workOrderId: query.parentId }),
      );
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const workOrderId = values['work-order-id'] as string;
      if (!workOrderId) {
        throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'work-order-id is required' });
      }
      const wo = await deps.workOrders.get(context.principal as any, workOrderId);
      assertCanExecute(context.principal, wo);
      const workerRef = (values['worker-ref'] as string) || context.principal.subject;
      const performedOn = typeof values['performed-on'] === 'string' && values['performed-on'].length >= 10
        ? values['performed-on'].slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const updated = await deps.workOrders.logLabour(context as any, workOrderId, {
        workerRef,
        hours: Number(values.hours),
        hourlyRate: values['hourly-rate'] !== null && values['hourly-rate'] !== undefined ? Number(values['hourly-rate']) : undefined,
        currencyCode: (values['currency-code'] as string) || undefined,
        timeCategory: (values['time-category'] as any) || 'REGULAR',
        performedOn,
        notes: (values.notes as string) || undefined,
      });
      const first = updated.labour[0]!;
      return toWindow(LABOUR_FIELDS, { ...first, workOrderId });
    },
  };

  const parts: RecordAdapter = {
    entityKey: 'cmms.work-order-parts',
    parentField: 'work-order-id',
    permissions: {
      read: 'cmms.work-orders.read',
      create: 'cmms.work-orders.execute-own',
    },
    fields: fieldPolicies(PARTS_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const wo = await deps.workOrders.get(principal as any, query.parentId);
      const items = (wo.parts ?? []).map((item) =>
        toWindow(PARTS_FIELDS, {
          ...item,
          quantity: item.quantity,
          workOrderId: query.parentId,
        }),
      );
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const workOrderId = values['work-order-id'] as string;
      if (!workOrderId) {
        throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'work-order-id is required' });
      }
      const wo = await deps.workOrders.get(context.principal as any, workOrderId);
      assertCanExecute(context.principal, wo);
      const partId = values['part-id'] as string;
      const quantity = Number(values.quantity);
      const updated = await deps.workOrders.issuePart(context as any, workOrderId, {
        partId,
        quantity,
        idempotencyKey: context.idempotencyKey || randomUUID(),
        storeroomId: (values['storeroom-id'] as string) || undefined,
        binLocation: (values['bin-location'] as string) || undefined,
        notes: (values.notes as string) || undefined,
      });
      const first = updated.parts[0]!;
      return toWindow(PARTS_FIELDS, {
        ...first,
        quantity: first.quantity,
        workOrderId,
      });
    },
  };

  const notes: RecordAdapter = {
    entityKey: 'cmms.work-order-notes',
    parentField: 'work-order-id',
    permissions: {
      read: 'cmms.work-orders.read',
      create: 'cmms.work-orders.execute-own',
    },
    fields: fieldPolicies(NOTES_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const wo = await deps.workOrders.get(principal as any, query.parentId);
      const items = (wo.notes ?? []).map((item) =>
        toWindow(NOTES_FIELDS, {
          id: item.id,
          body: (item.details as any)?.body ?? '',
          actorSubject: item.actorSubject,
          occurredAt: item.occurredAt,
          workOrderId: query.parentId,
        }),
      );
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const workOrderId = values['work-order-id'] as string;
      if (!workOrderId) {
        throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'work-order-id is required' });
      }
      const wo = await deps.workOrders.get(context.principal as any, workOrderId);
      assertCanExecute(context.principal, wo);
      const updated = await deps.workOrders.addNote(context as any, workOrderId, {
        body: values.body as string,
      });
      const first = updated.notes[0]!;
      return toWindow(NOTES_FIELDS, {
        id: first.id,
        body: (first.details as any)?.body ?? values.body,
        actorSubject: first.actorSubject,
        occurredAt: first.occurredAt,
        workOrderId,
      });
    },
  };

  const history: RecordAdapter = {
    entityKey: 'cmms.work-order-history',
    parentField: 'work-order-id',
    permissions: {
      read: 'cmms.work-orders.read',
    },
    fields: fieldPolicies(HISTORY_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const result = await deps.workOrders.history(principal as any, query.parentId);
      const items = (result.items ?? []).map((item) =>
        toWindow(HISTORY_FIELDS, { ...item, workOrderId: query.parentId }),
      );
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
  };

  const maintenanceRequests: RecordAdapter = {
    entityKey: 'cmms.maintenance-requests',
    permissions: {
      read: 'cmms.requests.read',
      create: 'cmms.requests.create',
    },
    fields: fieldPolicies(REQUEST_FIELDS),
    searchFields: ['request-number', 'title', 'requester-name'],
    filterFields: ['status', 'priority'],
    sortFields: ['request-number', 'title', 'created-at'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.requests) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const page = await deps.requests.search(principal as any, domainQuery(query));
      return {
        items: page.items.map((r) => toWindow(REQUEST_FIELDS, r)),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      if (!deps.requests) return null;
      const req = await deps.requests.get(principal as any, id);
      return toWindow(REQUEST_FIELDS, req);
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.requests) throw new BadRequestException('Requests service unavailable');
      const input = toDomain(REQUEST_FIELDS, values);
      const created = await deps.requests.submit(context as any, input);
      return toWindow(REQUEST_FIELDS, created);
    },
    actions: {
      accept: {
        permission: 'cmms.requests.write',
        run: async (context: RecordCommandContext, id: string, parameters: RecordValues): Promise<RecordValues> => {
          if (!deps.requests) throw new BadRequestException('Requests service unavailable');
          const res = await deps.requests.triage(context as any, id, {
            action: 'ACCEPT',
            workOrderType: parameters['work-order-type'] as any,
            priority: parameters['priority'] as any,
            assignedTo: parameters['assigned-to'] as any,
            expectedVersion: typeof parameters.expectedVersion === 'number' ? parameters.expectedVersion : undefined,
          });
          return toWindow(REQUEST_FIELDS, res.request);
        },
      },
      reject: {
        permission: 'cmms.requests.write',
        run: async (context: RecordCommandContext, id: string, parameters: RecordValues): Promise<RecordValues> => {
          if (!deps.requests) throw new BadRequestException('Requests service unavailable');
          const reason = (parameters.reason as string) || '';
          const res = await deps.requests.triage(context as any, id, {
            action: 'REJECT',
            reason,
            expectedVersion: typeof parameters.expectedVersion === 'number' ? parameters.expectedVersion : undefined,
          });
          return toWindow(REQUEST_FIELDS, res.request);
        },
      },
      cancel: {
        permission: 'cmms.requests.create',
        run: async (context: RecordCommandContext, id: string, parameters: RecordValues): Promise<RecordValues> => {
          if (!deps.requests) throw new BadRequestException('Requests service unavailable');
          const reason = parameters.reason as string | undefined;
          const res = await deps.requests.cancel(context as any, id, {
            reason,
            expectedVersion: typeof parameters.expectedVersion === 'number' ? parameters.expectedVersion : undefined,
          });
          return toWindow(REQUEST_FIELDS, res);
        },
      },
    },
  };

  const resolvers: LookupResolver[] = [
    {
      key: 'cmms-assets',
      permission: 'cmms.assets.read',
      async resolve(principal, request): Promise<readonly LookupOption[]> {
        const page = await deps.assets.search(principal as any, { q: request.search, pageSize: request.limit });
        return page.items.map((a) => ({
          value: a.id,
          label: `${a.name}${a.category ? ` (${a.category})` : ''}`,
        }));
      },
    },
    {
      key: 'cmms-parts',
      permission: 'cmms.parts.read',
      async resolve(principal, request): Promise<readonly LookupOption[]> {
        const page = await deps.parts.search(principal as any, { q: request.search, pageSize: request.limit });
        return page.items.map((p) => ({
          value: p.id,
          label: `${p.name} (${p.partNumber})`,
        }));
      },
    },
    {
      key: 'cmms-work-orders',
      permission: 'cmms.work-orders.read',
      async resolve(principal, request): Promise<readonly LookupOption[]> {
        const page = await deps.workOrders.search(principal as any, { q: request.search, pageSize: request.limit });
        return page.items.map((w) => ({
          value: w.id,
          label: `${w.woNumber} - ${w.title}`,
        }));
      },
    },
    {
      key: 'cmms-requests',
      permission: 'cmms.requests.read',
      async resolve(principal, request): Promise<readonly LookupOption[]> {
        if (!deps.requests) return [];
        const page = await deps.requests.search(principal as any, { q: request.search, pageSize: request.limit });
        return page.items.map((r) => ({
          value: r.id,
          label: `${r.requestNumber} - ${r.title}`,
        }));
      },
    },
  ];

  class MemoryIdempotencyStore implements IdempotencyStore {
    private readonly entries = new Map<string, IdempotencyEntry>();

    async claim(tenantId: string, key: string, _operation: string, requestHash: string): Promise<IdempotencyEntry | null> {
      const compound = `${tenantId}:${key}`;
      const existing = this.entries.get(compound);
      if (existing) return existing;
      this.entries.set(compound, { requestHash, state: 'IN_PROGRESS', response: null });
      return null;
    }

    async complete(tenantId: string, key: string, response: RecordValues): Promise<void> {
      const compound = `${tenantId}:${key}`;
      const existing = this.entries.get(compound);
      if (existing) {
        this.entries.set(compound, { requestHash: existing.requestHash, state: 'COMPLETED', response });
      }
    }

    async release(tenantId: string, key: string): Promise<void> {
      this.entries.delete(`${tenantId}:${key}`);
    }
  }

  return new RecordDispatcher(
    [workOrders, tasks, labour, parts, notes, history, maintenanceRequests],
    resolvers,
    idempotency ?? new MemoryIdempotencyStore(),
    shippedRecordRules('physical-operations-cmms'),
  );
}
