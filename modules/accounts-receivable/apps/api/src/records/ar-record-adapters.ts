import { randomUUID } from 'node:crypto';
import {
  type IdempotencyStore,
  type ModulePrincipal,
  type RecordCommandContext,
  type RecordAdapter,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordValues,
} from '@gigalibs/module-sdk';
import { shippedRecordRules } from '@gigalibs/configuration-core';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { ArPrincipal } from '../auth/authorization.js';
import type { CustomerResponse } from '../customers/customers.service.js';
import { CustomersService } from '../customers/customers.service.js';
import type { InvoiceResponse } from '../invoices/invoices.service.js';
import { InvoicesService } from '../invoices/invoices.service.js';
import type { DatabaseService } from '../database/database.service.js';

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
}

function fieldPolicies(fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> {
  return Object.fromEntries(fields.map((field) => [field.key, { writable: field.writable ?? false }]));
}

function arPrincipal(principal: ModulePrincipal): ArPrincipal {
  return {
    tenantId: principal.tenantId,
    subject: principal.subject,
    issuer: 'urn:gigalibs:platform-context:v1',
    permissions: principal.permissions,
  };
}

function matchesFields(record: RecordValues, search: string, fields: readonly string[]): boolean {
  const needle = search.toLowerCase();
  return fields.some((key) => {
    const value = record[key];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

function invoiceToWindow(invoice: InvoiceResponse): RecordValues {
  const line = invoice.lines[0];
  return {
    id: invoice.id,
    version: invoice.version,
    'invoice-number': invoice.invoiceNumber,
    'customer-id': invoice.customerId,
    currency: invoice.currency,
    'issue-date': invoice.issueDate,
    'due-date': invoice.dueDate,
    status: invoice.status,
    'total-minor': invoice.totalMinor,
    'amount-due-minor': invoice.amountDueMinor,
    ...(line
      ? {
          'line-description': line.description,
          'line-quantity': line.quantity,
          'line-unit-amount-minor': line.unitAmountMinor,
        }
      : {}),
  };
}

function customerToWindow(customer: CustomerResponse): RecordValues {
  return {
    id: customer.id,
    version: customer.version,
    'legal-name': customer.legalName,
    'billing-email': customer.billingEmail,
    currency: customer.currency,
    'external-reference': customer.externalReference ?? null,
    status: customer.status,
  };
}

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Maps metadata window values to AR draft invoice create body (exported for tests). */
export function windowValuesToCreateDraftInvoiceInput(values: RecordValues) {
  const issueDate = values['issue-date'];
  const dueDate = values['due-date'];
  const customerId = values['customer-id'];
  const parsedIssue = typeof issueDate === 'string' ? isoDate.safeParse(issueDate) : isoDate.safeParse(String(issueDate ?? ''));
  const parsedDue = typeof dueDate === 'string' ? isoDate.safeParse(dueDate) : isoDate.safeParse(String(dueDate ?? ''));
  const parsedCustomer = uuid.safeParse(customerId);
  if (!parsedCustomer.success) throw new BadRequestException('customer-id must be a UUID.');
  if (!parsedIssue.success || !parsedDue.success) throw new BadRequestException('issue-date and due-date must be YYYY-MM-DD.');
  const quantity = String(values['line-quantity'] ?? '1');
  const unitAmountMinor = Number(values['line-unit-amount-minor'] ?? 0);
  if (!Number.isInteger(unitAmountMinor) || unitAmountMinor < 0) {
    throw new BadRequestException('line-unit-amount-minor must be a non-negative integer.');
  }
  const description = values['line-description'];
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new BadRequestException('line-description is required.');
  }
  return {
    customerId: parsedCustomer.data,
    currency: typeof values.currency === 'string' ? values.currency : 'USD',
    issueDate: parsedIssue.data,
    dueDate: parsedDue.data,
    lines: [
      {
        description: description.trim(),
        quantity,
        unitAmountMinor,
      },
    ],
  };
}

/** Maps metadata window values to AR customer create body (exported for tests). */
export function windowValuesToCreateCustomerInput(values: RecordValues) {
  const legalName = values['legal-name'];
  const billingEmail = values['billing-email'];
  if (typeof legalName !== 'string' || legalName.trim().length === 0) {
    throw new BadRequestException('legal-name is required.');
  }
  if (typeof billingEmail !== 'string' || billingEmail.trim().length === 0) {
    throw new BadRequestException('billing-email is required.');
  }
  return {
    legalName: legalName.trim(),
    billingEmail: billingEmail.trim(),
    currency: typeof values.currency === 'string' ? values.currency : 'USD',
    externalReference:
      typeof values['external-reference'] === 'string' && values['external-reference'].trim().length > 0
        ? values['external-reference'].trim()
        : undefined,
  };
}

const INV_FIELDS: readonly FieldSpec[] = [
  { key: 'invoice-number' },
  { key: 'customer-id', writable: true },
  { key: 'currency', writable: true },
  { key: 'issue-date', writable: true },
  { key: 'due-date', writable: true },
  { key: 'status' },
  { key: 'total-minor' },
  { key: 'amount-due-minor' },
  { key: 'line-description', writable: true },
  { key: 'line-quantity', writable: true },
  { key: 'line-unit-amount-minor', writable: true },
];

const CUST_FIELDS: readonly FieldSpec[] = [
  { key: 'legal-name', writable: true },
  { key: 'billing-email', writable: true },
  { key: 'currency', writable: true },
  { key: 'external-reference', writable: true },
  { key: 'status' },
];

function idempotencyDatabase(database: DatabaseService): Pick<DatabaseService, 'withTenantTransaction'> {
  return {
    withTenantTransaction: (tenantId, operation) =>
      database.withTenantTransaction(tenantId, async (client) => {
        await client.query('SET LOCAL search_path TO gigalibs_ar, public');
        return operation(client);
      }),
  };
}

export function arRecordDispatcher(
  deps: { invoices: InvoicesService; customers: CustomersService },
  idempotency: IdempotencyStore,
): RecordDispatcher {
  const invoices: RecordAdapter = {
    entityKey: 'ar.invoices',
    permissions: { read: 'ar:read', create: 'ar:write' },
    rest: { read: 'GET v1/invoices', create: 'POST v1/invoices' },
    fields: fieldPolicies(INV_FIELDS),
    searchFields: ['invoice-number'],
    sortFields: ['invoice-number'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      const ar = arPrincipal(principal);
      const page = await deps.invoices.list(ar, 100);
      let items = page.items.map(invoiceToWindow);
      if (query.search) items = items.filter((item) => matchesFields(item, query.search!, ['invoice-number']));
      const sortField = query.sortField ?? 'invoice-number';
      const direction = query.sortDirection === 'ASC' ? 1 : -1;
      items.sort((left, right) => {
        const a = left[sortField];
        const b = right[sortField];
        if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b) * direction;
        if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
        return 0;
      });
      const start = (query.page - 1) * query.pageSize;
      const pageItems = items.slice(start, start + query.pageSize);
      return { page: query.page, pageSize: query.pageSize, total: items.length, items: pageItems };
    },
    async get(principal, id) {
      try {
        return invoiceToWindow(await deps.invoices.get(id, arPrincipal(principal)));
      } catch {
        return null;
      }
    },
    async create(context: RecordCommandContext, values) {
      const body = windowValuesToCreateDraftInvoiceInput(values);
      const key = context.idempotencyKey ?? randomUUID();
      const result = await deps.invoices.createDraft(
        body,
        arPrincipal(context.principal),
        key,
        context.correlationId,
      );
      return invoiceToWindow(result.body);
    },
  };

  const customers: RecordAdapter = {
    entityKey: 'ar.customers',
    permissions: { read: 'ar:read', create: 'ar:write' },
    rest: { read: 'GET v1/customers', create: 'POST v1/customers' },
    fields: fieldPolicies(CUST_FIELDS),
    searchFields: ['legal-name', 'billing-email'],
    sortFields: ['legal-name'],
    async list(principal: ModulePrincipal, query: RecordListQuery) {
      const ar = arPrincipal(principal);
      const page = await deps.customers.list(ar, 100, undefined, undefined, query.search);
      let items = page.items.map(customerToWindow);
      const sortField = query.sortField ?? 'legal-name';
      const direction = query.sortDirection === 'ASC' ? 1 : -1;
      items.sort((left, right) => {
        const a = left[sortField];
        const b = right[sortField];
        if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b) * direction;
        return 0;
      });
      const start = (query.page - 1) * query.pageSize;
      const pageItems = items.slice(start, start + query.pageSize);
      return { page: query.page, pageSize: query.pageSize, total: items.length, items: pageItems };
    },
    async get(principal, id) {
      try {
        return customerToWindow(await deps.customers.get(id, arPrincipal(principal)));
      } catch {
        return null;
      }
    },
    async create(context: RecordCommandContext, values) {
      const body = windowValuesToCreateCustomerInput(values);
      const key = context.idempotencyKey ?? randomUUID();
      const result = await deps.customers.create(
        body,
        arPrincipal(context.principal),
        key,
        context.correlationId,
      );
      return customerToWindow(result.body);
    },
  };

  return new RecordDispatcher([invoices, customers], [], idempotency, shippedRecordRules('accounts-receivable'));
}

export { idempotencyDatabase };
