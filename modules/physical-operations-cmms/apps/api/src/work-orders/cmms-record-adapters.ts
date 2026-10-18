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
import type { PmSchedulesService } from '../pm-schedules/pm-schedules.service.js';
import type { MetersService } from '../meters/meters.service.js';
import type { EamSpacesService } from '../spaces/spaces.service.js';
import type { ClassificationsService } from '../classifications/classifications.service.js';
import type { CmmsSpaceV1, CmmsAssetClassificationV1 } from '@gigalibs/contracts';

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
  readonly assets: AssetsService;
  readonly parts: PartsService;
  readonly requests?: RequestsService;
  readonly pmSchedules?: PmSchedulesService;
  readonly meters?: MetersService;
  readonly spaces?: EamSpacesService;
  readonly classifications?: ClassificationsService;
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
  { key: 'signed-off-at' },
  { key: 'signed-off-by' },
  { key: 'sign-off-note' },
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

const SCHEDULE_FIELDS: readonly FieldSpec[] = [
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'asset-id', writable: true },
  { key: 'is-active', writable: true },
  { key: 'interval-count', writable: true },
  { key: 'interval-unit', writable: true },
  { key: 'time-zone', writable: true },
  { key: 'next-due-at', writable: true },
  { key: 'last-generated-at' },
  { key: 'overdue' },
  { key: 'wo-title', writable: true },
  { key: 'wo-description', writable: true },
  { key: 'wo-priority', writable: true },
  { key: 'estimated-hours', writable: true },
  { key: 'requires-signature', writable: true },
];

const METER_FIELDS: readonly FieldSpec[] = [
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'asset-id', writable: true },
  { key: 'unit', writable: true },
  { key: 'reading-type', writable: true },
  { key: 'last-reading-value' },
  { key: 'last-reading-at' },
  { key: 'min-threshold', writable: true },
  { key: 'max-threshold', writable: true },
];

const READING_FIELDS: readonly FieldSpec[] = [
  { key: 'meter-id', writable: true },
  { key: 'value', writable: true },
  { key: 'delta' },
  { key: 'read-at', writable: true },
  { key: 'notes', writable: true },
  { key: 'recorded-by' },
  { key: 'recorded-at' },
];

const PART_FIELDS: readonly FieldSpec[] = [
  { key: 'part-number', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'category', writable: true },
  { key: 'unit-of-measure', writable: true },
  { key: 'unit-cost', writable: true },
  { key: 'currency-code', writable: true },
  { key: 'quantity-on-hand' },
  { key: 'min-quantity', writable: true },
  { key: 'reorder-point', writable: true },
  { key: 'non-stock', writable: true },
  { key: 'bin-location', writable: true },
  { key: 'barcode', writable: true },
];

const MOVEMENT_FIELDS: readonly FieldSpec[] = [
  { key: 'part-id', writable: true },
  { key: 'movement-type', writable: true },
  { key: 'quantity-delta', writable: true },
  { key: 'balance-after' },
  { key: 'unit-cost', writable: true },
  { key: 'currency-code', writable: true },
  { key: 'storeroom-id', writable: true },
  { key: 'bin-location', writable: true },
  { key: 'reason', writable: true },
  { key: 'created-by' },
  { key: 'created-at' },
];

const ASSET_FIELDS: readonly FieldSpec[] = [
  { key: 'asset-tag', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'category', writable: true },
  { key: 'status', writable: true },
  { key: 'criticality', writable: true },
  { key: 'manufacturer', writable: true },
  { key: 'model', writable: true },
  { key: 'serial-number', writable: true },
  { key: 'parent-asset-id', writable: true },
  { key: 'site-ref', writable: true },
  { key: 'space-id', writable: true },
  { key: 'classification-id', writable: true },
  { key: 'acquisition-cost', writable: true },
  { key: 'currency-code', writable: true },
  { key: 'purchase-date', writable: true, ...DATE },
  { key: 'warranty-expiry', writable: true, ...DATE },
  { key: 'archived-at' },
  { key: 'open-work-order-count' },
  { key: 'created-by' },
  { key: 'created-at' },
  { key: 'updated-at' },
];

const ASSET_SPEC_FIELDS: readonly FieldSpec[] = [
  { key: 'asset-id', writable: true },
  { key: 'spec-definition-id', writable: true },
  { key: 'attribute-key' },
  { key: 'label' },
  { key: 'data-type' },
  { key: 'uom' },
  { key: 'value-text', writable: true },
  { key: 'value-number', writable: true },
  { key: 'value-boolean', writable: true },
];

const SPACE_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'space-type', writable: true },
  { key: 'parent-space-id', writable: true },
  { key: 'site-ref', writable: true },
  { key: 'floor-number', writable: true },
  { key: 'gross-area-sqm', writable: true },
  { key: 'net-area-sqm', writable: true },
  { key: 'bim-guid', writable: true },
  { key: 'asset-count' },
  { key: 'created-by' },
  { key: 'created-at' },
  { key: 'updated-at' },
];

const SPACE_ASSET_FIELDS: readonly FieldSpec[] = [
  { key: 'space-id' },
  { key: 'asset-tag' },
  { key: 'name' },
  { key: 'category' },
  { key: 'status' },
  { key: 'criticality' },
];

const CLASSIFICATION_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'description', writable: true },
  { key: 'parent-class-id', writable: true },
  { key: 'spec-count' },
  { key: 'asset-count' },
  { key: 'created-by' },
  { key: 'created-at' },
  { key: 'updated-at' },
];

const SPEC_DEF_FIELDS: readonly FieldSpec[] = [
  { key: 'classification-id', writable: true },
  { key: 'attribute-key', writable: true },
  { key: 'label', writable: true },
  { key: 'data-type', writable: true },
  { key: 'uom', writable: true },
  { key: 'required', writable: true },
  { key: 'min-value', writable: true },
  { key: 'max-value', writable: true },
  { key: 'default-value', writable: true },
];

function flattenSpaces(spaces: readonly any[]): CmmsSpaceV1[] {
  const result: CmmsSpaceV1[] = [];
  function recurse(nodes: readonly any[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) recurse(node.children);
    }
  }
  recurse(spaces);
  return result;
}

function flattenClassifications(classes: readonly any[]): CmmsAssetClassificationV1[] {
  const result: CmmsAssetClassificationV1[] = [];
  function recurse(nodes: readonly any[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children?.length) recurse(node.children);
    }
  }
  recurse(classes);
  return result;
}

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

async function executeSignOff(
  deps: CmmsRecordDependencies,
  context: RecordCommandContext,
  workOrderId: string,
  parameters: RecordValues,
): Promise<RecordValues> {
  const current = await deps.workOrders.get(context.principal as any, workOrderId);
  const expectedVersion =
    typeof parameters.expectedVersion === 'number' ? parameters.expectedVersion : current.version;
  const note =
    typeof parameters.reason === 'string'
      ? parameters.reason
      : typeof parameters.note === 'string'
        ? parameters.note
        : undefined;
  if (!note) {
    throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'A sign-off note is required.' });
  }
  const updated = await deps.workOrders.signOff(context as any, workOrderId, { expectedVersion, note });
  return toWindow(WORK_ORDER_FIELDS, updated);
}

/** CMMS record dispatcher: work orders and their child entities (tasks, labour, parts, notes, history). */
export function cmmsRecordDispatcher(deps: CmmsRecordDependencies, idempotency: IdempotencyStore): RecordDispatcher {
  const workOrders: RecordAdapter = {
    rest: {
      read: 'POST v1/work-orders/search',
      create: 'POST v1/work-orders',
      update: 'PATCH v1/work-orders/{id}',
      actions: {
        start: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
        hold: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
        resume: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
        complete: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
        cancel: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
        'sign-off': 'POST v1/work-orders/{id}/sign-off',
      },
    },
    entityKey: 'cmms.work-orders',
    permissions: {
      read: 'cmms.work-orders.read',
      create: 'cmms.work-orders.write',
      update: 'cmms.work-orders.write',
    },
    fields: fieldPolicies(WORK_ORDER_FIELDS),
    searchFields: ['wo-number', 'title'],
    filterFields: ['status', 'priority'],
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
      // WI-OI-120be (W1 review B, M4): putting work on hold or cancelling it is a planner's decision.
      hold: {
        permission: 'cmms.work-orders.write',
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
      // WI-OI-120be (W1 review B, M4): putting work on hold or cancelling it is a planner's decision.
      cancel: {
        permission: 'cmms.work-orders.write',
        run: (context, id, params) => executeStatusTransition(deps, context, id, 'CANCELLED', params),
      },
      'sign-off': {
        permission: 'cmms.work-orders.write',
        run: (context, id, params) => executeSignOff(deps, context, id, params),
      },
    },
  };

  const tasks: RecordAdapter = {
    rest: {
      read: 'GET v1/work-orders/{id}',
      create: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
      update: 'PATCH v1/work-orders/{id}/tasks/{id}',
    },
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
    rest: {
      read: 'GET v1/work-orders/{id}',
      create: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
    },
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
      // WI-OI-120be (W1 review B, L1): only a planner (write) logs time for someone else or sets a rate; execute-own logs
      // the caller's own time at the default rate.
      const planner = holdsPermission(context.principal.permissions, 'cmms.work-orders.write');
      const workerRef = (planner && (values['worker-ref'] as string)) || context.principal.subject;
      const performedOn = typeof values['performed-on'] === 'string' && values['performed-on'].length >= 10
        ? values['performed-on'].slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const updated = await deps.workOrders.logLabour(context as any, workOrderId, {
        workerRef,
        hours: Number(values.hours),
        hourlyRate:
          planner && values['hourly-rate'] !== null && values['hourly-rate'] !== undefined ? Number(values['hourly-rate']) : undefined,
        currencyCode: (values['currency-code'] as string) || undefined,
        timeCategory: (values['time-category'] as any) || 'REGULAR',
        performedOn,
        notes: (values.notes as string) || undefined,
      });
      const first = updated.labour[0]!;
      return toWindow(LABOUR_FIELDS, { ...first, workOrderId });
    },
  };

  const workOrderParts: RecordAdapter = {
    rest: {
      read: 'GET v1/work-orders/{id}',
      create: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
    },
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
    rest: {
      read: 'GET v1/work-orders/{id}',
      create: 'POST v1/work-orders/{id}/status|tasks|labour|parts|notes',
    },
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
    rest: { read: 'GET v1/work-orders/{id}/history' },
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
    rest: {
      read: 'POST v1/requests/search',
      create: 'POST v1/requests',
      actions: {
        accept: 'POST v1/requests/{id}/triage',
        reject: 'POST v1/requests/{id}/triage',
        cancel: 'POST v1/requests/{id}/cancel',
      },
    },
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

  const pmSchedules: RecordAdapter = {
    rest: {
      read: 'GET v1/pm-schedules',
      create: 'POST v1/pm-schedules',
      update: 'PATCH v1/pm-schedules/{id}',
      actions: { generate: 'POST v1/pm-schedules/{id}/generate' },
    },
    entityKey: 'cmms.pm-schedules',
    permissions: {
      read: 'cmms.pm.read',
      create: 'cmms.pm.write',
      update: 'cmms.pm.write',
    },
    fields: fieldPolicies(SCHEDULE_FIELDS),
    searchFields: ['name', 'wo-title'],
    sortFields: ['name', 'next-due-at'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.pmSchedules) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const assetId = query.filters?.assetId;
      const res = await deps.pmSchedules.list(principal as any, assetId);
      const items = res.items.map((s) => toWindow(SCHEDULE_FIELDS, s));
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      if (!deps.pmSchedules) return null;
      const s = await deps.pmSchedules.get(principal as any, id);
      return toWindow(SCHEDULE_FIELDS, s);
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.pmSchedules) throw new BadRequestException('PM schedules service unavailable');
      const input = toDomain(SCHEDULE_FIELDS, values);
      if (input.nextDueAt && !input.firstDueAt) {
        input.firstDueAt = input.nextDueAt;
      }
      const created = await deps.pmSchedules.create(context as any, input);
      return toWindow(SCHEDULE_FIELDS, created);
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      if (!deps.pmSchedules) throw new BadRequestException('PM schedules service unavailable');
      const input = toDomain(SCHEDULE_FIELDS, values);
      const updated = await deps.pmSchedules.update(context as any, id, { ...input, expectedVersion });
      return toWindow(SCHEDULE_FIELDS, updated);
    },
    actions: {
      generate: {
        permission: 'cmms.pm.write',
        run: async (context: RecordCommandContext, id: string, parameters: RecordValues): Promise<RecordValues> => {
          if (!deps.pmSchedules) throw new BadRequestException('PM schedules service unavailable');
          const expectedVersion = typeof parameters.expectedVersion === 'number' ? parameters.expectedVersion : 1;
          const res = await deps.pmSchedules.generate(context as any, id, { expectedVersion });
          return toWindow(SCHEDULE_FIELDS, res.schedule);
        },
      },
    },
  };

  const meters: RecordAdapter = {
    rest: { read: 'GET v1/meters', create: 'POST v1/meters' },
    entityKey: 'cmms.meters',
    permissions: {
      read: 'cmms.meters.read',
      create: 'cmms.meters.write',
    },
    fields: fieldPolicies(METER_FIELDS),
    searchFields: ['name', 'unit'],
    sortFields: ['name'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.meters) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const assetId = query.filters?.assetId;
      const res = await deps.meters.list(principal as any, assetId);
      const items = res.items.map((m) => toWindow(METER_FIELDS, m));
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      if (!deps.meters) return null;
      const m = await deps.meters.get(principal as any, id);
      return toWindow(METER_FIELDS, m);
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.meters) throw new BadRequestException('Meters service unavailable');
      const input = toDomain(METER_FIELDS, values);
      const created = await deps.meters.create(context as any, input);
      return toWindow(METER_FIELDS, created);
    },
  };

  const meterReadings: RecordAdapter = {
    rest: { read: 'GET v1/meters/{id}/readings', create: 'POST v1/meters/{id}/readings' },
    entityKey: 'cmms.meter-readings',
    parentField: 'meter-id',
    permissions: {
      read: 'cmms.meters.read',
      create: 'cmms.meters.write',
    },
    fields: fieldPolicies(READING_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.meters || !query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const res = await deps.meters.readings(principal as any, query.parentId);
      const items = res.items.map((r) => toWindow(READING_FIELDS, r));
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.meters) throw new BadRequestException('Meters service unavailable');
      const meterId = values['meter-id'] as string;
      if (!meterId) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'meter-id is required' });
      const requestKey = (values.requestKey as string) || randomUUID();
      const res = await deps.meters.recordReading(context as any, meterId, {
        value: Number(values.value),
        readAt: values['read-at'] as string | undefined,
        notes: (values.notes as string) || undefined,
        requestKey,
      });
      return toWindow(READING_FIELDS, res.reading);
    },
  };

  const parts: RecordAdapter = {
    rest: { read: 'POST v1/parts/search', create: 'POST v1/parts', update: 'PATCH v1/parts/{id}' },
    entityKey: 'cmms.parts',
    permissions: {
      read: 'cmms.parts.read',
      create: 'cmms.parts.write',
      update: 'cmms.parts.write',
    },
    fields: fieldPolicies(PART_FIELDS),
    searchFields: ['part-number', 'name', 'bin-location'],
    sortFields: ['part-number', 'name'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      const page = await deps.parts.search(principal as any, domainQuery(query));
      return {
        items: page.items.map((p) => toWindow(PART_FIELDS, p)),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      const p = await deps.parts.get(principal as any, id);
      return toWindow(PART_FIELDS, p);
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const input = toDomain(PART_FIELDS, values);
      if (!input.currencyCode) input.currencyCode = 'USD';
      const created = await deps.parts.create(context as any, input);
      return toWindow(PART_FIELDS, created);
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      const input = toDomain(PART_FIELDS, values);
      const updated = await deps.parts.update(context as any, id, { ...input, expectedVersion });
      return toWindow(PART_FIELDS, updated);
    },
  };

  const partMovements: RecordAdapter = {
    rest: { read: 'GET v1/parts/{id}/movements', create: 'POST v1/parts/{id}/movements' },
    entityKey: 'cmms.part-movements',
    parentField: 'part-id',
    permissions: {
      read: 'cmms.parts.read',
      create: 'cmms.parts.write',
    },
    fields: fieldPolicies(MOVEMENT_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const res = await deps.parts.movements(principal as any, query.parentId);
      const items = res.items.map((m) => toWindow(MOVEMENT_FIELDS, m));
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const partId = values['part-id'] as string;
      if (!partId) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'part-id is required' });
      const idempotencyKey = (context.idempotencyKey as string) || (values.idempotencyKey as string) || randomUUID();
      const movementType = (values['movement-type'] as string) || 'RECEIPT';
      const quantity = Math.abs(Number(values['quantity-delta'] ?? 1));
      let rawPayload: Record<string, unknown>;
      if (movementType === 'ADJUSTMENT') {
        rawPayload = {
          movementType: 'ADJUSTMENT',
          idempotencyKey,
          quantityDelta: Number(values['quantity-delta']),
          reason: (values.reason as string) || 'Manual adjustment',
        };
      } else if (movementType === 'RETURN') {
        rawPayload = {
          movementType: 'RETURN',
          idempotencyKey,
          quantity,
          workOrderId: values['work-order-id'] as string,
          reason: (values.reason as string) || undefined,
        };
      } else {
        rawPayload = {
          movementType: 'RECEIPT',
          idempotencyKey,
          quantity,
          unitCost: values['unit-cost'] !== undefined && values['unit-cost'] !== null ? Number(values['unit-cost']) : undefined,
          reason: (values.reason as string) || undefined,
        };
      }
      const res = await deps.parts.recordMovement(context as any, partId, rawPayload);
      return toWindow(MOVEMENT_FIELDS, res.movement);
    },
  };

  const assets: RecordAdapter = {
    rest: {
      read: 'POST v1/assets/search',
      create: 'POST v1/assets',
      update: 'PATCH v1/assets/{id}',
      actions: { archive: 'POST v1/assets/{id}/archive' },
    },
    entityKey: 'cmms.assets',
    permissions: {
      read: 'cmms.assets.read',
      create: 'cmms.assets.write',
      update: 'cmms.assets.write',
    },
    fields: fieldPolicies(ASSET_FIELDS),
    searchFields: ['asset-tag', 'name', 'category'],
    filterFields: ['status', 'criticality'],
    sortFields: ['asset-tag', 'name', 'created-at'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      const page = await deps.assets.search(principal as any, domainQuery(query));
      return {
        items: page.items.map((a) => toWindow(ASSET_FIELDS, a)),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
      };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      try {
        const a = await deps.assets.get(principal as any, id);
        return toWindow(ASSET_FIELDS, a);
      } catch (error) {
        if (error instanceof NotFoundException) return null;
        throw error;
      }
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      const input = toDomain(ASSET_FIELDS, values);
      const created = await deps.assets.create(context as any, input);
      return toWindow(ASSET_FIELDS, created);
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      const input = toDomain(ASSET_FIELDS, values);
      const updated = await deps.assets.update(context as any, id, { ...input, expectedVersion });
      return toWindow(ASSET_FIELDS, updated);
    },
    actions: {
      archive: {
        permission: 'cmms.assets.write',
        run: async (context: RecordCommandContext, id: string, parameters: RecordValues): Promise<RecordValues> => {
          const reason = (parameters.reason as string) || (parameters.notes as string) || 'Asset archived via window';
          const current = await deps.assets.get(context.principal as any, id);
          const expectedVersion = typeof parameters.expectedVersion === 'number' ? parameters.expectedVersion : current.version;
          const archived = await deps.assets.archive(context as any, id, { reason, expectedVersion });
          return toWindow(ASSET_FIELDS, archived);
        },
      },
    },
  };

  const assetSpecs: RecordAdapter = {
    rest: {
      read: 'GET v1/assets/{id}/specs',
      create: 'PUT v1/assets/{id}/specs',
      update: 'PUT v1/assets/{id}/specs',
    },
    entityKey: 'cmms.asset-specs',
    parentField: 'asset-id',
    permissions: {
      read: 'cmms.assets.read',
      create: 'cmms.assets.write',
      update: 'cmms.assets.write',
    },
    fields: fieldPolicies(ASSET_SPEC_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.classifications || !query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const specs = await deps.classifications.getAssetSpecs(principal as any, query.parentId);
      const items = specs.map((s) =>
        toWindow(ASSET_SPEC_FIELDS, {
          id: s.specDefinitionId,
          assetId: query.parentId,
          specDefinitionId: s.specDefinitionId,
          attributeKey: s.attributeKey,
          label: s.label,
          dataType: s.dataType,
          uom: s.uom,
          valueText: s.valueText,
          valueNumber: s.valueNumber,
          valueBoolean: s.valueBoolean,
        }),
      );
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.classifications) throw new BadRequestException('Classifications service unavailable');
      const assetId = values['asset-id'] as string;
      if (!assetId) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'asset-id is required' });
      const specDefinitionId = values['spec-definition-id'] as string;
      if (!specDefinitionId) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'spec-definition-id is required' });
      const valueText = values['value-text'] !== undefined ? (values['value-text'] as string) : undefined;
      const valueNumber = values['value-number'] !== undefined && values['value-number'] !== null ? Number(values['value-number']) : undefined;
      const valueBoolean = values['value-boolean'] !== undefined && values['value-boolean'] !== null ? Boolean(values['value-boolean']) : undefined;
      await deps.classifications.setAssetSpecs(context as any, assetId, {
        specs: [{ specDefinitionId, valueText, valueNumber, valueBoolean }],
      });
      const specs = await deps.classifications.getAssetSpecs(context.principal as any, assetId);
      const updated = specs.find((s) => s.specDefinitionId === specDefinitionId);
      return toWindow(ASSET_SPEC_FIELDS, {
        id: specDefinitionId,
        assetId,
        ...(updated ?? { specDefinitionId, valueText, valueNumber, valueBoolean }),
      });
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      if (!deps.classifications) throw new BadRequestException('Classifications service unavailable');
      const assetId = values['asset-id'] as string;
      if (!assetId) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'asset-id is required' });
      const specDefinitionId = (values['spec-definition-id'] as string) || id;
      const valueText = values['value-text'] !== undefined ? (values['value-text'] as string) : undefined;
      const valueNumber = values['value-number'] !== undefined && values['value-number'] !== null ? Number(values['value-number']) : undefined;
      const valueBoolean = values['value-boolean'] !== undefined && values['value-boolean'] !== null ? Boolean(values['value-boolean']) : undefined;
      await deps.classifications.setAssetSpecs(context as any, assetId, {
        specs: [{ specDefinitionId, valueText, valueNumber, valueBoolean }],
      });
      const specs = await deps.classifications.getAssetSpecs(context.principal as any, assetId);
      const updated = specs.find((s) => s.specDefinitionId === specDefinitionId);
      return toWindow(ASSET_SPEC_FIELDS, {
        id: specDefinitionId,
        assetId,
        ...(updated ?? { specDefinitionId, valueText, valueNumber, valueBoolean }),
      });
    },
  };

  const spaces: RecordAdapter = {
    rest: {
      read: 'GET v1/spaces/tree',
      create: 'POST v1/spaces',
      update: 'PATCH v1/spaces/{id}',
      actions: { delete: 'DELETE v1/spaces/{id}' },
    },
    entityKey: 'cmms.spaces',
    permissions: {
      read: 'cmms.assets.read',
      create: 'cmms.assets.write',
      update: 'cmms.assets.write',
    },
    fields: fieldPolicies(SPACE_FIELDS),
    searchFields: ['code', 'name'],
    sortFields: ['code', 'name', 'floor-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.spaces) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const tree = await deps.spaces.tree(principal as any);
      const flattened = flattenSpaces(tree);
      let filtered = flattened;
      if (query.search) {
        const q = query.search.toLowerCase();
        filtered = filtered.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
      }
      const total = filtered.length;
      const start = ((query.page ?? 1) - 1) * (query.pageSize ?? 25);
      const pageItems = filtered.slice(start, start + (query.pageSize ?? 25));
      return {
        items: pageItems.map((s) => toWindow(SPACE_FIELDS, s)),
        total,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 25,
      };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      if (!deps.spaces) return null;
      try {
        const s = await deps.spaces.get(principal as any, id);
        return toWindow(SPACE_FIELDS, s);
      } catch (error) {
        if (error instanceof NotFoundException) return null;
        throw error;
      }
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.spaces) throw new BadRequestException('Spaces service unavailable');
      const input = toDomain(SPACE_FIELDS, values);
      const created = await deps.spaces.create(context as any, input);
      return toWindow(SPACE_FIELDS, created);
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      if (!deps.spaces) throw new BadRequestException('Spaces service unavailable');
      const input = toDomain(SPACE_FIELDS, values);
      const updated = await deps.spaces.update(context as any, id, { ...input, expectedVersion });
      return toWindow(SPACE_FIELDS, updated);
    },
    actions: {
      delete: {
        permission: 'cmms.assets.write',
        run: async (context: RecordCommandContext, id: string): Promise<RecordValues> => {
          if (!deps.spaces) throw new BadRequestException('Spaces service unavailable');
          const current = await deps.spaces.get(context.principal as any, id);
          await deps.spaces.delete(context as any, id);
          return toWindow(SPACE_FIELDS, current);
        },
      },
    },
  };

  const spaceAssets: RecordAdapter = {
    rest: { read: 'GET v1/spaces/{id}/assets' },
    entityKey: 'cmms.space-assets',
    parentField: 'space-id',
    permissions: {
      read: 'cmms.assets.read',
    },
    fields: fieldPolicies(SPACE_ASSET_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.spaces || !query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const assetsInSpace = await deps.spaces.getAssetsInSpace(principal as any, query.parentId);
      const items = assetsInSpace.map((a) =>
        toWindow(SPACE_ASSET_FIELDS, {
          id: a.id,
          spaceId: query.parentId,
          assetTag: a.assetTag,
          name: a.name,
          category: a.category,
          status: a.status,
          criticality: a.criticality,
        }),
      );
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
  };

  const classifications: RecordAdapter = {
    rest: {
      read: 'GET v1/classifications/tree',
      create: 'POST v1/classifications',
      update: 'PATCH v1/classifications/{id}',
      actions: { delete: 'DELETE v1/classifications/{id}' },
    },
    entityKey: 'cmms.classifications',
    permissions: {
      read: 'cmms.assets.read',
      create: 'cmms.assets.write',
      update: 'cmms.assets.write',
    },
    fields: fieldPolicies(CLASSIFICATION_FIELDS),
    searchFields: ['code', 'name'],
    sortFields: ['code', 'name'],
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.classifications) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const tree = await deps.classifications.listTree(principal as any);
      const flattened = flattenClassifications(tree);
      let filtered = flattened;
      if (query.search) {
        const q = query.search.toLowerCase();
        filtered = filtered.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
      }
      const total = filtered.length;
      const start = ((query.page ?? 1) - 1) * (query.pageSize ?? 25);
      const pageItems = filtered.slice(start, start + (query.pageSize ?? 25));
      return {
        items: pageItems.map((c) => toWindow(CLASSIFICATION_FIELDS, c)),
        total,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 25,
      };
    },
    async get(principal: ModulePrincipal, id: string): Promise<RecordValues | null> {
      if (!deps.classifications) return null;
      try {
        const c = await deps.classifications.get(principal as any, id);
        return toWindow(CLASSIFICATION_FIELDS, c);
      } catch (error) {
        if (error instanceof NotFoundException) return null;
        throw error;
      }
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.classifications) throw new BadRequestException('Classifications service unavailable');
      const input = toDomain(CLASSIFICATION_FIELDS, values);
      const created = await deps.classifications.create(context as any, input);
      return toWindow(CLASSIFICATION_FIELDS, created);
    },
    async update(context: RecordCommandContext, id: string, values: RecordValues, expectedVersion: number): Promise<RecordValues> {
      if (!deps.classifications) throw new BadRequestException('Classifications service unavailable');
      const input = toDomain(CLASSIFICATION_FIELDS, values);
      const updated = await deps.classifications.update(context as any, id, { ...input, expectedVersion });
      return toWindow(CLASSIFICATION_FIELDS, updated);
    },
    actions: {
      delete: {
        permission: 'cmms.assets.write',
        run: async (context: RecordCommandContext, id: string): Promise<RecordValues> => {
          if (!deps.classifications) throw new BadRequestException('Classifications service unavailable');
          const current = await deps.classifications.get(context.principal as any, id);
          await deps.classifications.delete(context as any, id);
          return toWindow(CLASSIFICATION_FIELDS, current);
        },
      },
    },
  };

  const specDefinitions: RecordAdapter = {
    rest: {
      read: 'GET v1/classifications/{id}/spec-definitions',
      create: 'POST v1/classifications/spec-definitions',
    },
    entityKey: 'cmms.spec-definitions',
    parentField: 'classification-id',
    permissions: {
      read: 'cmms.assets.read',
      create: 'cmms.assets.write',
    },
    fields: fieldPolicies(SPEC_DEF_FIELDS),
    async list(principal: ModulePrincipal, query: RecordListQuery): Promise<RecordPage> {
      if (!deps.classifications || !query.parentId) return { items: [], total: 0, page: 1, pageSize: query.pageSize };
      const defs = await deps.classifications.listSpecDefinitions(principal as any, query.parentId);
      const items = defs.map((d) => toWindow(SPEC_DEF_FIELDS, d));
      return { items, total: items.length, page: 1, pageSize: query.pageSize };
    },
    async get(): Promise<RecordValues | null> {
      return null;
    },
    async create(context: RecordCommandContext, values: RecordValues): Promise<RecordValues> {
      if (!deps.classifications) throw new BadRequestException('Classifications service unavailable');
      const classificationId = values['classification-id'] as string;
      if (!classificationId) throw new BadRequestException({ code: 'CMMS_VALIDATION_FAILED', message: 'classification-id is required' });
      const input = toDomain(SPEC_DEF_FIELDS, values);
      const created = await deps.classifications.createSpecDefinition(context as any, { ...input, classificationId });
      return toWindow(SPEC_DEF_FIELDS, created);
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
    {
      key: 'cmms-spaces',
      permission: 'cmms.assets.read',
      async resolve(principal, request): Promise<readonly LookupOption[]> {
        if (!deps.spaces) return [];
        const tree = await deps.spaces.tree(principal as any);
        const flattened = flattenSpaces(tree);
        let list = flattened;
        if (request.search) {
          const q = request.search.toLowerCase();
          list = list.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
        }
        return list.slice(0, request.limit).map((s) => ({
          value: s.id,
          label: `${s.code} - ${s.name} (${s.spaceType})`,
        }));
      },
    },
    {
      key: 'cmms-classifications',
      permission: 'cmms.assets.read',
      async resolve(principal, request): Promise<readonly LookupOption[]> {
        if (!deps.classifications) return [];
        const tree = await deps.classifications.listTree(principal as any);
        const flattened = flattenClassifications(tree);
        let list = flattened;
        if (request.search) {
          const q = request.search.toLowerCase();
          list = list.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
        }
        return list.slice(0, request.limit).map((c) => ({
          value: c.id,
          label: `${c.code} - ${c.name}`,
        }));
      },
    },
  ];

  return new RecordDispatcher(
    [
      workOrders,
      tasks,
      labour,
      workOrderParts,
      notes,
      history,
      maintenanceRequests,
      pmSchedules,
      meters,
      meterReadings,
      parts,
      partMovements,
      assets,
      assetSpecs,
      spaces,
      spaceAssets,
      classifications,
      specDefinitions,
    ],
    resolvers,
    idempotency,
    shippedRecordRules('physical-operations-cmms'),
  );
}
