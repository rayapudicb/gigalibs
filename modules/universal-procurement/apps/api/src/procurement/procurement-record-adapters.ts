import { CreatePurchaseOrderInputV1Schema } from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  type ModulePrincipal,
  type RecordAdapter,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordValues,
} from '@gigalibs/module-sdk';
import { shippedRecordRules } from '@gigalibs/configuration-core';
import { BadRequestException } from '@nestjs/common';
import type { ProcurementService } from './procurement.service.js';

// WI-OI-120gh: record routes for the first Procurement metadata window (purchase order header + first line on create).

const camel = (key: string) => key.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
  readonly domain?: string;
}

const domainName = (field: FieldSpec) => field.domain ?? camel(field.key);

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(fields.map((field) => [field.key, { writable: field.writable ?? false }]));
}

function toWindow(fields: readonly FieldSpec[], record: Readonly<Record<string, unknown>>): RecordValues {
  const values: Record<string, unknown> = { id: record.id };
  if (record.version !== undefined) values.version = record.version;
  for (const field of fields) {
    values[field.key] = record[domainName(field)] ?? null;
  }
  return values;
}

const PO_FIELDS: readonly FieldSpec[] = [
  { key: 'order-number', domain: 'orderNumber' },
  { key: 'org-unit-id', domain: 'orgUnitId', writable: true },
  { key: 'vendor-id', domain: 'vendorPartyId', writable: true },
  { key: 'vendor-name', domain: 'vendorName', writable: true },
  { key: 'destination-warehouse-id', domain: 'destinationWarehouseId', writable: true },
  { key: 'currency-code', domain: 'currencyCode', writable: true },
  { key: 'status' },
  { key: 'total-amount', domain: 'totalAmountMinor' },
  { key: 'line-product-id', writable: true },
  { key: 'line-product-code', writable: true },
  { key: 'line-product-name', writable: true },
  { key: 'line-ordered-quantity', writable: true },
  { key: 'line-uom-id', writable: true },
  { key: 'line-unit-price-minor', writable: true },
  { key: 'line-destination-warehouse-id', writable: true },
];

/** Maps metadata window values to the procurement create contract (exported for tests). */
export function windowValuesToCreatePurchaseOrderInput(values: RecordValues) {
  const headerWarehouse = values['destination-warehouse-id'];
  const lineWarehouse = values['line-destination-warehouse-id'] ?? headerWarehouse;
  if (typeof headerWarehouse !== 'string' || !headerWarehouse) {
    throw new BadRequestException({ code: 'UNIVERSAL_PROCUREMENT_VALIDATION_FAILED', message: 'destination-warehouse-id is required.' });
  }
  const input = {
    orgUnitId: values['org-unit-id'],
    vendorPartyId: values['vendor-id'],
    vendorName: values['vendor-name'],
    currencyCode: values['currency-code'] ?? 'USD',
    destinationWarehouseId: headerWarehouse,
    lines: [
      {
        productId: values['line-product-id'],
        productCode: values['line-product-code'],
        productName: values['line-product-name'],
        orderedQuantity: String(values['line-ordered-quantity'] ?? '1.000000'),
        uomId: values['line-uom-id'],
        unitPriceMinor: String(values['line-unit-price-minor'] ?? '0'),
        destinationWarehouseId: lineWarehouse,
      },
    ],
  };
  const parsed = CreatePurchaseOrderInputV1Schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException({
      code: 'UNIVERSAL_PROCUREMENT_VALIDATION_FAILED',
      message: `${issue?.path.join('.') ?? 'value'}: ${issue?.message ?? 'invalid'}`,
    });
  }
  return parsed.data;
}

function matchesSearch(record: RecordValues, search: string): boolean {
  const needle = search.toLowerCase();
  return ['order-number', 'vendor-name'].some((key) => {
    const value = record[key];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

export function procurementRecordDispatcher(deps: { procurement: ProcurementService }, idempotency: IdempotencyStore): RecordDispatcher {
  const purchaseOrders: RecordAdapter = {
    entityKey: 'procurement.purchase-orders',
    permissions: { read: 'procurement:read', create: 'procurement:orders:manage' },
    rest: { read: 'GET v1/orders', create: 'POST v1/orders' },
    fields: fieldPolicies(PO_FIELDS),
    searchFields: ['order-number', 'vendor-name'],
    sortFields: ['order-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      let items = (await deps.procurement.listPurchaseOrders(principal)).map((order) =>
        toWindow(PO_FIELDS, order as unknown as Record<string, unknown>),
      );
      if (query.search) items = items.filter((item) => matchesSearch(item, query.search!));
      const sortField = query.sortField ?? 'order-number';
      const direction = query.sortDirection === 'ASC' ? 1 : -1;
      items.sort((left, right) => {
        const a = left[sortField];
        const b = right[sortField];
        if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b) * direction;
        return 0;
      });
      const start = (query.page - 1) * query.pageSize;
      const pageItems = items.slice(start, start + query.pageSize);
      return { page: query.page, pageSize: query.pageSize, totalItems: items.length, items: pageItems };
    },
    async get(principal, id) {
      try {
        const order = await deps.procurement.getPurchaseOrder(principal, id);
        return toWindow(PO_FIELDS, order as unknown as Record<string, unknown>);
      } catch {
        return null;
      }
    },
    async create(context, values) {
      const order = await deps.procurement.createPurchaseOrder(
        context.principal,
        windowValuesToCreatePurchaseOrderInput(values),
      );
      return toWindow(PO_FIELDS, order as unknown as Record<string, unknown>);
    },
  };

  return new RecordDispatcher([purchaseOrders], [], idempotency, shippedRecordRules('universal-procurement'));
}
