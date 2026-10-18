import { CreateSalesOrderInputV1Schema, type SalesOrderV1 } from '@gigalibs/contracts';
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
import type { OrderService } from './orders.service.js';

// WI-OI-120gj: record routes for the first Orders metadata window (sales order header + first line on create).

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
}

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(fields.map((field) => [field.key, { writable: field.writable ?? false }]));
}

function salesOrderToWindow(order: SalesOrderV1): RecordValues {
  const line = order.lines?.[0];
  const values: Record<string, unknown> = {
    id: order.id,
    version: order.version,
    'order-number': order.orderNumber,
    'org-unit-id': order.orgUnitId,
    'customer-id': order.customerPartyId,
    'customer-name': order.customerName,
    'order-type': order.orderType,
    'warehouse-id': order.warehouseId,
    'currency-code': order.currencyCode,
    status: order.status,
    'total-amount': order.totalAmountMinor,
    'customer-po-reference': order.customerPoReference ?? null,
  };
  if (line) {
    values['line-product-id'] = line.productId;
    values['line-product-code'] = line.productCode;
    values['line-product-name'] = line.productName;
    values['line-ordered-quantity'] = line.orderedQuantity;
    values['line-uom-id'] = line.uomId;
    values['line-unit-price-minor'] = line.unitPriceMinor;
    values['line-warehouse-id'] = line.warehouseId;
  }
  return values;
}

const SO_FIELDS: readonly FieldSpec[] = [
  { key: 'order-number' },
  { key: 'org-unit-id', writable: true },
  { key: 'customer-id', writable: true },
  { key: 'customer-name', writable: true },
  { key: 'order-type', writable: true },
  { key: 'warehouse-id', writable: true },
  { key: 'currency-code', writable: true },
  { key: 'status' },
  { key: 'total-amount' },
  { key: 'customer-po-reference', writable: true },
  { key: 'line-product-id', writable: true },
  { key: 'line-product-code', writable: true },
  { key: 'line-product-name', writable: true },
  { key: 'line-ordered-quantity', writable: true },
  { key: 'line-uom-id', writable: true },
  { key: 'line-unit-price-minor', writable: true },
  { key: 'line-warehouse-id', writable: true },
];

/** Maps metadata window values to the orders create contract (exported for tests). */
export function windowValuesToCreateSalesOrderInput(values: RecordValues) {
  const headerWarehouse = values['warehouse-id'];
  const lineWarehouse = values['line-warehouse-id'] ?? headerWarehouse;
  if (typeof headerWarehouse !== 'string' || !headerWarehouse) {
    throw new BadRequestException({ code: 'UNIVERSAL_ORDERS_VALIDATION_FAILED', message: 'warehouse-id is required.' });
  }
  const input = {
    orgUnitId: values['org-unit-id'],
    customerPartyId: values['customer-id'],
    customerName: values['customer-name'],
    orderType: values['order-type'] ?? 'STANDARD',
    currencyCode: values['currency-code'] ?? 'USD',
    warehouseId: headerWarehouse,
    customerPoReference: values['customer-po-reference'] ?? null,
    lines: [
      {
        productId: values['line-product-id'],
        productCode: values['line-product-code'],
        productName: values['line-product-name'],
        orderedQuantity: String(values['line-ordered-quantity'] ?? '1.000000'),
        uomId: values['line-uom-id'],
        unitPriceMinor: String(values['line-unit-price-minor'] ?? '0'),
        warehouseId: lineWarehouse,
      },
    ],
  };
  const parsed = CreateSalesOrderInputV1Schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException({
      code: 'UNIVERSAL_ORDERS_VALIDATION_FAILED',
      message: `${issue?.path.join('.') ?? 'value'}: ${issue?.message ?? 'invalid'}`,
    });
  }
  return parsed.data;
}

function matchesSearch(record: RecordValues, search: string): boolean {
  const needle = search.toLowerCase();
  return ['order-number', 'customer-name'].some((key) => {
    const value = record[key];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

export function ordersRecordDispatcher(deps: { orders: OrderService }, idempotency: IdempotencyStore): RecordDispatcher {
  const salesOrders: RecordAdapter = {
    entityKey: 'orders.sales-orders',
    permissions: { read: 'orders:read', create: 'orders:manage' },
    rest: { read: 'GET v1/orders', create: 'POST v1/orders' },
    fields: fieldPolicies(SO_FIELDS),
    searchFields: ['order-number', 'customer-name'],
    sortFields: ['order-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      let items = (await deps.orders.listSalesOrders(principal)).map(salesOrderToWindow);
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
        const order = await deps.orders.getOrder(principal.tenantId, id);
        return salesOrderToWindow(order);
      } catch {
        return null;
      }
    },
    async create(context, values) {
      const order = await deps.orders.createOrder(
        context.principal.tenantId,
        context.principal.subject,
        windowValuesToCreateSalesOrderInput(values),
      );
      return salesOrderToWindow(order);
    },
  };

  return new RecordDispatcher([salesOrders], [], idempotency, shippedRecordRules('universal-orders'));
}
