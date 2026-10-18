import {
  CreateInventoryItemInputV1Schema,
  CreateLocationInputV1Schema,
  CreateLotInputV1Schema,
  CreateReceiptInputV1Schema,
  CreateReceiptLineInputV1Schema,
  CreateWarehouseInputV1Schema,
  WarehouseTypeSchema,
} from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  type LookupResolver,
  type ModulePrincipal,
  type RecordAdapter,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { shippedRecordRules } from '@gigalibs/configuration-core';
import { BadRequestException } from '@nestjs/common';
import { type InventoryEntity, type InventoryPage, type InventoryRecordsService, InventoryVersionConflict } from './inventory-records.service.js';
import type { InventoryService } from './inventory.service.js';

// WI-OI-120f (F0.5, ADR-0033 D1): Inventory's record adapters behind its metadata windows. Window field keys are the
// dictionary's kebab-case keys (`warehouse-type`); the domain speaks camelCase (`warehouseType`). Every create goes
// through the same contract schema and domain method as Inventory's own API, so the window enforces the same rules.

const camel = (key: string) => key.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
  readonly readPermission?: string;
  readonly writePermission?: string;
  /** Converts a window value to the domain value (dates to timestamps). */
  readonly toDomain?: (value: unknown) => unknown;
}

const date = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      {
        writable: field.writable ?? false,
        ...(field.readPermission ? { readPermission: field.readPermission } : {}),
        ...(field.writePermission ? { writePermission: field.writePermission } : {}),
      },
    ]),
  );
}

/** A domain record as window values: the declared keys only, plus id and version. */
function toWindow(fields: readonly FieldSpec[], record: Readonly<Record<string, unknown>>): RecordValues {
  const values: Record<string, unknown> = { id: record.id };
  if (record.version !== undefined) values.version = record.version;
  for (const field of fields) values[field.key] = record[camel(field.key)] ?? null;
  return values;
}

/** Window values as domain input: camelCase keys, empty values dropped, conversions applied. */
function toDomain(fields: readonly FieldSpec[], values: RecordValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in values)) continue;
    const value = values[field.key];
    if (value === null || value === '') continue;
    input[camel(field.key)] = field.toDomain ? field.toDomain(value) : value;
  }
  return input;
}

function parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new BadRequestException({
    code: 'UNIVERSAL_INVENTORY_VALIDATION_FAILED',
    message: `${issue?.path.join('.') ?? 'value'}: ${issue?.message ?? 'invalid'}`,
  });
}

function domainQuery(query: RecordListQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.search ? { search: query.search } : {}),
    ...(query.sortField ? { sortField: camel(query.sortField) } : {}),
    sortDirection: query.sortDirection,
    filters: Object.fromEntries(Object.entries(query.filters).map(([key, value]) => [camel(key), value])),
    ...(query.parentId ? { parentId: query.parentId } : {}),
  };
}

function pageOf(fields: readonly FieldSpec[], page: InventoryPage) {
  return { ...page, items: page.items.map((item) => toWindow(fields, item)) };
}

const WAREHOUSE_FIELDS: readonly FieldSpec[] = [
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'warehouse-type', writable: true },
  { key: 'description', writable: true },
  { key: 'address', writable: true },
  { key: 'is-active' },
];
const LOCATION_FIELDS: readonly FieldSpec[] = [
  { key: 'warehouse-id', writable: true },
  { key: 'code', writable: true },
  { key: 'name', writable: true },
  { key: 'location-type', writable: true },
  { key: 'aisle', writable: true },
  { key: 'rack', writable: true },
  { key: 'shelf', writable: true },
  { key: 'bin', writable: true },
  { key: 'barcode', writable: true },
  { key: 'allow-negative', writable: true },
  { key: 'is-active' },
];
const ITEM_FIELDS: readonly FieldSpec[] = [
  { key: 'product-id', writable: true },
  { key: 'default-warehouse-id', writable: true },
  { key: 'default-location-id', writable: true },
  { key: 'is-lot-tracked', writable: true },
  { key: 'is-serial-tracked', writable: true },
  { key: 'shelf-life-days', writable: true },
  { key: 'reorder-point', writable: true },
  { key: 'safety-stock', writable: true },
  { key: 'valuation-method', writable: true },
  { key: 'standard-cost-minor', writable: true },
  { key: 'is-active' },
];
const LOT_FIELDS: readonly FieldSpec[] = [
  { key: 'product-id', writable: true },
  { key: 'lot-number', writable: true },
  { key: 'batch-code', writable: true },
  { key: 'supplier-lot-number', writable: true },
  { key: 'manufactured-date', writable: true, toDomain: date },
  { key: 'expiry-date', writable: true, toDomain: date },
  { key: 'status' },
];
const RECEIPT_FIELDS: readonly FieldSpec[] = [
  { key: 'receipt-number' },
  { key: 'warehouse-id', writable: true },
  { key: 'external-document-reference', writable: true },
  { key: 'notes', writable: true },
  { key: 'status' },
  { key: 'finance-posting-status' },
  { key: 'finance-posting-rejection-code' },
  { key: 'created-at' },
  { key: 'completed-at' },
];
const RECEIPT_LINE_FIELDS: readonly FieldSpec[] = [
  { key: 'receipt-id', writable: true },
  { key: 'line-number' },
  { key: 'product-id', writable: true },
  { key: 'uom-id', writable: true },
  { key: 'expected-quantity', writable: true },
  { key: 'received-quantity' },
  { key: 'target-location-id', writable: true },
  { key: 'lot-number', writable: true },
  { key: 'expiry-date', writable: true, toDomain: date },
  { key: 'inspection-status' },
];
const BALANCE_FIELDS: readonly FieldSpec[] = [
  { key: 'warehouse-id' },
  { key: 'location-id' },
  { key: 'product-id' },
  { key: 'stock-status' },
  { key: 'on-hand-quantity' },
  { key: 'reserved-quantity' },
  { key: 'available-quantity' },
  { key: 'last-movement-at' },
];
const LEDGER_FIELDS: readonly FieldSpec[] = [
  { key: 'created-at' },
  { key: 'direction' },
  { key: 'warehouse-id' },
  { key: 'location-id' },
  { key: 'product-id' },
  { key: 'quantity' },
  { key: 'stock-status' },
  { key: 'transaction-id' },
];

export interface InventoryRecordDependencies {
  readonly inventory: Pick<InventoryService, 'createWarehouse' | 'createLocation' | 'createItem' | 'createLot' | 'createReceipt' | 'completeReceipt'>;
  readonly records: Pick<InventoryRecordsService, 'page' | 'get' | 'updateWarehouse' | 'addReceiptLine' | 'lookup'>;
}

function readAdapter(
  deps: InventoryRecordDependencies,
  entityKey: string,
  entity: InventoryEntity,
  fields: readonly FieldSpec[],
  read: string,
  options: { search?: readonly string[]; filter?: readonly string[]; sort?: readonly string[]; parent?: string } = {},
): RecordAdapter {
  return {
    entityKey,
    permissions: { read },
    fields: fieldPolicies(fields),
    searchFields: options.search ?? [],
    filterFields: options.filter ?? [],
    sortFields: options.sort ?? [],
    ...(options.parent ? { parentField: options.parent } : {}),
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      return pageOf(fields, await deps.records.page(principal, entity, domainQuery(query)));
    },
    async get(principal: ModulePrincipal, id: string) {
      const record = await deps.records.get(principal, entity, id);
      return record ? toWindow(fields, record) : null;
    },
  };
}

/** Inventory's record dispatcher: the entities and lookups its windows use. */
export function inventoryRecordDispatcher(deps: InventoryRecordDependencies, idempotency: IdempotencyStore): RecordDispatcher {
  const warehouses: RecordAdapter = {
    rest: {
      read: 'GET v1/warehouses',
      create: 'POST v1/warehouses',
      update: 'PATCH v1/warehouses/{id}',
    },
    ...readAdapter(deps, 'inventory.warehouses', 'warehouses', WAREHOUSE_FIELDS, 'inventory:read', {
      search: ['code', 'name'],
      filter: ['warehouse-type'],
      sort: ['code', 'name'],
    }),
    permissions: { read: 'inventory:read', create: 'inventory:warehouses:manage', update: 'inventory:warehouses:manage' },
    async create(context, values) {
      const input = parse(CreateWarehouseInputV1Schema, toDomain(WAREHOUSE_FIELDS, values));
      return toWindow(WAREHOUSE_FIELDS, { ...(await deps.inventory.createWarehouse(context.principal, input, context)) });
    },
    async update(context, id, values, expectedVersion) {
      const input = toDomain(WAREHOUSE_FIELDS, values);
      if ('code' in input) throw new BadRequestException({ code: 'UNIVERSAL_INVENTORY_VALIDATION_FAILED', message: 'A warehouse code cannot change.' });
      if (input.warehouseType !== undefined) parse(WarehouseTypeSchema, input.warehouseType);
      try {
        return toWindow(WAREHOUSE_FIELDS, await deps.records.updateWarehouse(context.principal, id, input, expectedVersion));
      } catch (error) {
        if (error instanceof InventoryVersionConflict) throw new RecordVersionConflict();
        throw error;
      }
    },
  };

  const locations: RecordAdapter = {
    rest: { read: 'GET v1/locations', create: 'POST v1/locations' },
    ...readAdapter(deps, 'inventory.locations', 'locations', LOCATION_FIELDS, 'inventory:read', {
      search: ['code', 'name', 'barcode'],
      filter: ['location-type'],
      sort: ['code', 'name'],
      parent: 'warehouse-id',
    }),
    permissions: { read: 'inventory:read', create: 'inventory:warehouses:manage' },
    async create(context, values) {
      const input = parse(CreateLocationInputV1Schema, toDomain(LOCATION_FIELDS, values));
      return toWindow(LOCATION_FIELDS, { ...(await deps.inventory.createLocation(context.principal, input)) });
    },
  };

  const items: RecordAdapter = {
    rest: { read: 'GET v1/items', create: 'POST v1/items' },
    ...readAdapter(deps, 'inventory.items', 'items', ITEM_FIELDS, 'inventory:read', { filter: ['valuation-method'] }),
    permissions: { read: 'inventory:read', create: 'inventory:items:manage' },
    async create(context, values) {
      const input = toDomain(ITEM_FIELDS, values);
      if (typeof input.shelfLifeDays === 'string') input.shelfLifeDays = Number(input.shelfLifeDays);
      return toWindow(ITEM_FIELDS, { ...(await deps.inventory.createItem(context.principal, parse(CreateInventoryItemInputV1Schema, input))) });
    },
  };

  const lots: RecordAdapter = {
    rest: { read: 'GET v1/lots', create: 'POST v1/lots' },
    ...readAdapter(deps, 'inventory.lots', 'lots', LOT_FIELDS, 'inventory:read', {
      search: ['lot-number', 'batch-code', 'supplier-lot-number'],
      filter: ['status'],
      sort: ['lot-number', 'expiry-date'],
    }),
    permissions: { read: 'inventory:read', create: 'inventory:receive' },
    async create(context, values) {
      const input = parse(CreateLotInputV1Schema, toDomain(LOT_FIELDS, values));
      return toWindow(LOT_FIELDS, { ...(await deps.inventory.createLot(context.principal, input)) });
    },
  };

  const receipts: RecordAdapter = {
    rest: {
      read: 'GET v1/receipts',
      create: 'POST v1/receipts',
      actions: { complete: 'POST v1/receipts/{id}/complete' },
    },
    ...readAdapter(deps, 'inventory.receipts', 'receipts', RECEIPT_FIELDS, 'inventory:read', {
      search: ['receipt-number', 'external-document-reference'],
      filter: ['status'],
      sort: ['receipt-number', 'created-at'],
    }),
    permissions: { read: 'inventory:read', create: 'inventory:receive' },
    async create(context, values) {
      const input = parse(CreateReceiptInputV1Schema, toDomain(RECEIPT_FIELDS, values));
      const { lines: _lines, ...receipt } = await deps.inventory.createReceipt(context.principal, input);
      return toWindow(RECEIPT_FIELDS, receipt);
    },
    actions: {
      complete: {
        permission: 'inventory:receive',
        async run(context, id) {
          const { lines: _lines, ...receipt } = await deps.inventory.completeReceipt(context.principal, id);
          return toWindow(RECEIPT_FIELDS, receipt);
        },
      },
    },
  };

  const receiptLines: RecordAdapter = {
    // A line is received with its receipt: REST adds lines when it creates the receipt.
    rest: { read: 'GET v1/receipts', create: 'POST v1/receipts' },
    ...readAdapter(deps, 'inventory.receipt-lines', 'receiptLines', RECEIPT_LINE_FIELDS, 'inventory:read', {
      search: ['lot-number'],
      filter: ['inspection-status'],
      sort: ['line-number'],
      parent: 'receipt-id',
    }),
    permissions: { read: 'inventory:read', create: 'inventory:receive' },
    async create(context, values) {
      const { receiptId, ...line } = toDomain(RECEIPT_LINE_FIELDS, values);
      if (typeof receiptId !== 'string') throw new BadRequestException({ code: 'UNIVERSAL_INVENTORY_VALIDATION_FAILED', message: 'receipt-id is required.' });
      const parsed = parse(CreateReceiptLineInputV1Schema, line);
      return toWindow(RECEIPT_LINE_FIELDS, await deps.records.addReceiptLine(context.principal, receiptId, parsed));
    },
  };

  const balances: RecordAdapter = {
    rest: { read: 'GET v1/balances' },
    ...readAdapter(deps, 'inventory.balances', 'balances', BALANCE_FIELDS, 'inventory:read', {
      filter: ['stock-status'],
      sort: ['last-movement-at'],
    }),
  };
  const ledger: RecordAdapter = {
    rest: { read: 'GET v1/ledger' },
    ...readAdapter(deps, 'inventory.ledger', 'ledger', LEDGER_FIELDS, 'inventory:ledger:read', {
      filter: ['direction', 'stock-status'],
      sort: ['created-at'],
    }),
  };

  const resolvers: LookupResolver[] = [
    { key: 'inventory-warehouses', permission: 'inventory:read', resolve: (principal, request) => deps.records.lookup(principal, 'warehouses', request) },
    { key: 'inventory-locations', permission: 'inventory:read', resolve: (principal, request) => deps.records.lookup(principal, 'locations', request) },
  ];

  // WI-OI-120r (S1): the field rules of Inventory's windows, enforced on every create and change.
  return new RecordDispatcher([warehouses, locations, items, lots, receipts, receiptLines, balances, ledger], resolvers, idempotency, shippedRecordRules('universal-inventory'));
}
