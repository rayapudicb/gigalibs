import {
  CreateCustomerInvoiceInputV1Schema,
  CreateSalesOrderInputV1Schema,
  CreateSalesQuoteInputV1Schema,
  type CustomerInvoiceV1,
  type SalesOrderV1,
  type SalesQuoteV1,
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
import type { OrderService } from './orders.service.js';

// WI-OI-120gj–gl: record routes for Orders metadata windows (quotes, orders, customer invoices).

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
}

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(fields.map((field) => [field.key, { writable: field.writable ?? false }]));
}

function normalizeDatetime(value: unknown, fallbackDaysFromNow: number): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value instanceof Date) return value.toISOString();
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + fallbackDaysFromNow);
  return fallback.toISOString();
}

function customerInvoiceToWindow(invoice: CustomerInvoiceV1): RecordValues {
  return {
    id: invoice.id,
    version: invoice.version,
    'invoice-number': invoice.invoiceNumber,
    'order-id': invoice.orderId,
    'customer-name': invoice.customerName,
    'currency-code': invoice.currencyCode,
    'due-date': invoice.dueDate,
    notes: invoice.notes ?? null,
    status: invoice.status,
    'total-amount': invoice.totalAmountMinor,
  };
}

function salesQuoteToWindow(quote: SalesQuoteV1): RecordValues {
  const line = quote.lines?.[0];
  const values: Record<string, unknown> = {
    id: quote.id,
    version: quote.version,
    'quote-number': quote.quoteNumber,
    'org-unit-id': quote.orgUnitId,
    'customer-id': quote.customerPartyId,
    'customer-name': quote.customerName,
    'currency-code': quote.currencyCode,
    'valid-until': quote.validUntil,
    'payment-term-days': quote.paymentTermDays,
    notes: quote.notes ?? null,
    status: quote.status,
    'total-amount': quote.totalAmountMinor,
  };
  if (line) {
    values['line-product-id'] = line.productId;
    values['line-product-code'] = line.productCode;
    values['line-product-name'] = line.productName;
    values['line-quoted-quantity'] = line.quotedQuantity;
    values['line-uom-id'] = line.uomId;
    values['line-unit-price-minor'] = line.unitPriceMinor;
  }
  return values;
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

const SQ_FIELDS: readonly FieldSpec[] = [
  { key: 'quote-number' },
  { key: 'org-unit-id', writable: true },
  { key: 'customer-id', writable: true },
  { key: 'customer-name', writable: true },
  { key: 'currency-code', writable: true },
  { key: 'valid-until', writable: true },
  { key: 'payment-term-days', writable: true },
  { key: 'notes', writable: true },
  { key: 'status' },
  { key: 'total-amount' },
  { key: 'line-product-id', writable: true },
  { key: 'line-product-code', writable: true },
  { key: 'line-product-name', writable: true },
  { key: 'line-quoted-quantity', writable: true },
  { key: 'line-uom-id', writable: true },
  { key: 'line-unit-price-minor', writable: true },
];

/** Maps metadata window values to the quote create contract (exported for tests). */
export function windowValuesToCreateSalesQuoteInput(values: RecordValues) {
  const validUntil = normalizeDatetime(values['valid-until'], 30);
  const input = {
    orgUnitId: values['org-unit-id'],
    customerPartyId: values['customer-id'],
    customerName: values['customer-name'],
    currencyCode: values['currency-code'] ?? 'USD',
    validUntil,
    paymentTermDays: values['payment-term-days'] ?? 30,
    notes: values['notes'] ?? null,
    lines: [
      {
        productId: values['line-product-id'],
        productCode: values['line-product-code'],
        productName: values['line-product-name'],
        quotedQuantity: String(values['line-quoted-quantity'] ?? '1.000000'),
        uomId: values['line-uom-id'],
        unitPriceMinor: String(values['line-unit-price-minor'] ?? '0'),
      },
    ],
  };
  const parsed = CreateSalesQuoteInputV1Schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException({
      code: 'UNIVERSAL_ORDERS_VALIDATION_FAILED',
      message: `${issue?.path.join('.') ?? 'value'}: ${issue?.message ?? 'invalid'}`,
    });
  }
  return parsed.data;
}

const CI_FIELDS: readonly FieldSpec[] = [
  { key: 'invoice-number' },
  { key: 'order-id', writable: true },
  { key: 'customer-name' },
  { key: 'currency-code' },
  { key: 'due-date', writable: true },
  { key: 'notes', writable: true },
  { key: 'status' },
  { key: 'total-amount' },
];

/** Maps metadata window values to the customer invoice create contract (exported for tests). */
export function windowValuesToCreateCustomerInvoiceInput(values: RecordValues) {
  const input = {
    orderId: values['order-id'],
    dueDate: normalizeDatetime(values['due-date'], 30),
    notes: values['notes'] ?? null,
  };
  const parsed = CreateCustomerInvoiceInputV1Schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestException({
      code: 'UNIVERSAL_ORDERS_VALIDATION_FAILED',
      message: `${issue?.path.join('.') ?? 'value'}: ${issue?.message ?? 'invalid'}`,
    });
  }
  return parsed.data;
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

function matchesFields(record: RecordValues, search: string, fields: readonly string[]): boolean {
  const needle = search.toLowerCase();
  return fields.some((key) => {
    const value = record[key];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

export function ordersRecordDispatcher(deps: { orders: OrderService }, idempotency: IdempotencyStore): RecordDispatcher {
  const salesQuotes: RecordAdapter = {
    entityKey: 'orders.sales-quotes',
    permissions: { read: 'orders:read', create: 'orders:quotes:manage' },
    rest: { read: 'GET v1/quotes', create: 'POST v1/quotes' },
    fields: fieldPolicies(SQ_FIELDS),
    searchFields: ['quote-number', 'customer-name'],
    sortFields: ['quote-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      let items = (await deps.orders.listSalesQuotes(principal)).map(salesQuoteToWindow);
      if (query.search) items = items.filter((item) => matchesFields(item, query.search!, ['quote-number', 'customer-name']));
      const sortField = query.sortField ?? 'quote-number';
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
        const quote = await deps.orders.getQuote(principal.tenantId, id);
        return salesQuoteToWindow(quote);
      } catch {
        return null;
      }
    },
    async create(context, values) {
      const quote = await deps.orders.createQuote(
        context.principal.tenantId,
        context.principal.subject,
        windowValuesToCreateSalesQuoteInput(values),
      );
      return salesQuoteToWindow(quote);
    },
  };

  const salesOrders: RecordAdapter = {
    entityKey: 'orders.sales-orders',
    permissions: { read: 'orders:read', create: 'orders:manage' },
    rest: { read: 'GET v1/orders', create: 'POST v1/orders' },
    fields: fieldPolicies(SO_FIELDS),
    searchFields: ['order-number', 'customer-name'],
    sortFields: ['order-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      let items = (await deps.orders.listSalesOrders(principal)).map(salesOrderToWindow);
      if (query.search) items = items.filter((item) => matchesFields(item, query.search!, ['order-number', 'customer-name']));
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

  const customerInvoices: RecordAdapter = {
    entityKey: 'orders.customer-invoices',
    permissions: { read: 'orders:read', create: 'orders:invoices:manage' },
    rest: { read: 'GET v1/invoices', create: 'POST v1/invoices' },
    fields: fieldPolicies(CI_FIELDS),
    searchFields: ['invoice-number', 'customer-name'],
    sortFields: ['invoice-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      let items = (await deps.orders.listCustomerInvoices(principal)).map(customerInvoiceToWindow);
      if (query.search) items = items.filter((item) => matchesFields(item, query.search!, ['invoice-number', 'customer-name']));
      const sortField = query.sortField ?? 'invoice-number';
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
        const invoice = await deps.orders.getCustomerInvoice(principal.tenantId, id);
        return customerInvoiceToWindow(invoice);
      } catch {
        return null;
      }
    },
    async create(context, values) {
      const invoice = await deps.orders.createCustomerInvoice(
        context.principal.tenantId,
        context.principal.subject,
        windowValuesToCreateCustomerInvoiceInput(values),
      );
      return customerInvoiceToWindow(invoice);
    },
  };

  return new RecordDispatcher([salesQuotes, salesOrders, customerInvoices], [], idempotency, shippedRecordRules('universal-orders'));
}
