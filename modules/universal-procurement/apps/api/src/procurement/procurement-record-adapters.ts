import {
  CreatePurchaseOrderInputV1Schema,
  CreateRequisitionInputV1Schema,
  CreateVendorBillInputV1Schema,
  type ProcurementRequisitionV1,
  type VendorBillV1,
} from '@gigalibs/contracts';
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

// WI-OI-120gh/gn: record routes for Procurement metadata windows (PO and vendor bills).

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

function normalizeDatetime(value: unknown, fallbackDaysFromNow: number): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Date) return value.toISOString();
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + fallbackDaysFromNow);
  return fallback.toISOString();
}

function requisitionToWindow(requisition: ProcurementRequisitionV1): RecordValues {
  const line = requisition.lines?.[0];
  const values: Record<string, unknown> = {
    id: requisition.id,
    version: requisition.version,
    'requisition-number': requisition.requisitionNumber,
    'org-unit-id': requisition.orgUnitId,
    description: requisition.description ?? null,
    'currency-code': requisition.currencyCode,
    status: requisition.status,
    'total-estimated': requisition.totalEstimatedMinor,
  };
  if (line) {
    values['line-product-id'] = line.productId;
    values['line-product-code'] = line.productCode;
    values['line-product-name'] = line.productName;
    values['line-quantity'] = line.quantity;
    values['line-uom-id'] = line.uomId;
    values['line-estimated-unit-price-minor'] = line.estimatedUnitPriceMinor;
  }
  return values;
}

function vendorBillToWindow(bill: VendorBillV1): RecordValues {
  const line = bill.lines?.[0];
  const values: Record<string, unknown> = {
    id: bill.id,
    version: bill.version,
    'vendor-invoice-number': bill.vendorInvoiceNumber,
    'vendor-id': bill.vendorPartyId,
    'invoice-date': bill.invoiceDate,
    'due-date': bill.dueDate,
    'purchase-order-id': bill.purchaseOrderId ?? null,
    'currency-code': bill.currencyCode,
    status: bill.status,
    'total-amount': bill.totalAmountMinor,
  };
  if (line) {
    values['line-description'] = line.description;
    values['line-billed-quantity'] = line.billedQuantity;
    values['line-uom-id'] = line.uomId;
    values['line-unit-price-minor'] = line.unitPriceMinor;
    values['line-product-id'] = line.productId ?? null;
  }
  return values;
}

const REQ_FIELDS: readonly FieldSpec[] = [
  { key: 'requisition-number', domain: 'requisitionNumber' },
  { key: 'org-unit-id', domain: 'orgUnitId', writable: true },
  { key: 'description', writable: true },
  { key: 'currency-code', domain: 'currencyCode', writable: true },
  { key: 'status' },
  { key: 'total-estimated', domain: 'totalEstimatedMinor' },
  { key: 'line-product-id', writable: true },
  { key: 'line-product-code', writable: true },
  { key: 'line-product-name', writable: true },
  { key: 'line-quantity', writable: true },
  { key: 'line-uom-id', writable: true },
  { key: 'line-estimated-unit-price-minor', writable: true },
];

/** Maps metadata window values to the requisition create contract (exported for tests). */
export function windowValuesToCreateRequisitionInput(values: RecordValues) {
  const input = {
    orgUnitId: values['org-unit-id'],
    description: values['description'] ?? null,
    currencyCode: values['currency-code'] ?? 'USD',
    lines: [
      {
        productId: values['line-product-id'],
        productCode: values['line-product-code'],
        productName: values['line-product-name'],
        quantity: String(values['line-quantity'] ?? '1.000000'),
        uomId: values['line-uom-id'],
        estimatedUnitPriceMinor: String(values['line-estimated-unit-price-minor'] ?? '0'),
      },
    ],
  };
  const parsed = CreateRequisitionInputV1Schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException({
      code: 'UNIVERSAL_PROCUREMENT_VALIDATION_FAILED',
      message: `${issue?.path.join('.') ?? 'value'}: ${issue?.message ?? 'invalid'}`,
    });
  }
  return parsed.data;
}

const VB_FIELDS: readonly FieldSpec[] = [
  { key: 'vendor-invoice-number', domain: 'vendorInvoiceNumber', writable: true },
  { key: 'vendor-id', domain: 'vendorPartyId', writable: true },
  { key: 'invoice-date', domain: 'invoiceDate', writable: true },
  { key: 'due-date', domain: 'dueDate', writable: true },
  { key: 'purchase-order-id', domain: 'purchaseOrderId', writable: true },
  { key: 'currency-code', domain: 'currencyCode', writable: true },
  { key: 'status' },
  { key: 'total-amount', domain: 'totalAmountMinor' },
  { key: 'line-description', writable: true },
  { key: 'line-billed-quantity', writable: true },
  { key: 'line-uom-id', writable: true },
  { key: 'line-unit-price-minor', writable: true },
  { key: 'line-product-id', writable: true },
];

/** Maps metadata window values to the vendor bill create contract (exported for tests). */
export function windowValuesToCreateVendorBillInput(values: RecordValues) {
  const poId = values['purchase-order-id'];
  const input = {
    vendorPartyId: values['vendor-id'],
    vendorInvoiceNumber: values['vendor-invoice-number'],
    invoiceDate: normalizeDatetime(values['invoice-date'], 0),
    dueDate: normalizeDatetime(values['due-date'], 30),
    currencyCode: values['currency-code'] ?? 'USD',
    purchaseOrderId: typeof poId === 'string' && poId.length > 0 ? poId : null,
    lines: [
      {
        purchaseOrderId: typeof poId === 'string' && poId.length > 0 ? poId : null,
        productId: values['line-product-id'] ?? null,
        description: values['line-description'],
        billedQuantity: String(values['line-billed-quantity'] ?? '1.000000'),
        uomId: values['line-uom-id'],
        unitPriceMinor: String(values['line-unit-price-minor'] ?? '0'),
      },
    ],
  };
  const parsed = CreateVendorBillInputV1Schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException({
      code: 'UNIVERSAL_PROCUREMENT_VALIDATION_FAILED',
      message: `${issue?.path.join('.') ?? 'value'}: ${issue?.message ?? 'invalid'}`,
    });
  }
  return parsed.data;
}

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
  const requisitions: RecordAdapter = {
    entityKey: 'procurement.requisitions',
    permissions: { read: 'procurement:read', create: 'procurement:requisitions:manage' },
    rest: { read: 'GET v1/requisitions', create: 'POST v1/requisitions' },
    fields: fieldPolicies(REQ_FIELDS),
    searchFields: ['requisition-number', 'description'],
    sortFields: ['requisition-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      let items = (await deps.procurement.listRequisitions(principal)).map(requisitionToWindow);
      if (query.search) {
        items = items.filter((item) => {
          const needle = query.search!.toLowerCase();
          return ['requisition-number', 'description'].some((key) => {
            const value = item[key];
            return typeof value === 'string' && value.toLowerCase().includes(needle);
          });
        });
      }
      const sortField = query.sortField ?? 'requisition-number';
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
        const requisition = await deps.procurement.getRequisition(principal, id);
        return requisitionToWindow(requisition);
      } catch {
        return null;
      }
    },
    async create(context, values) {
      const requisition = await deps.procurement.createRequisition(
        context.principal,
        windowValuesToCreateRequisitionInput(values),
      );
      return requisitionToWindow(requisition);
    },
  };

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

  const vendorBills: RecordAdapter = {
    entityKey: 'procurement.vendor-bills',
    permissions: { read: 'procurement:read', create: 'procurement:bills:manage' },
    rest: { read: 'GET v1/bills', create: 'POST v1/bills' },
    fields: fieldPolicies(VB_FIELDS),
    searchFields: ['vendor-invoice-number'],
    sortFields: ['vendor-invoice-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      let items = (await deps.procurement.listVendorBills(principal)).map(vendorBillToWindow);
      if (query.search) {
        items = items.filter((item) => {
          const needle = query.search!.toLowerCase();
          const num = item['vendor-invoice-number'];
          return typeof num === 'string' && num.toLowerCase().includes(needle);
        });
      }
      const sortField = query.sortField ?? 'vendor-invoice-number';
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
        const bill = await deps.procurement.getVendorBill(principal, id);
        return vendorBillToWindow(bill);
      } catch {
        return null;
      }
    },
    async create(context, values) {
      const bill = await deps.procurement.createVendorBill(context.principal, windowValuesToCreateVendorBillInput(values));
      return vendorBillToWindow(bill);
    },
  };

  return new RecordDispatcher([requisitions, purchaseOrders, vendorBills], [], idempotency, shippedRecordRules('universal-procurement'));
}
