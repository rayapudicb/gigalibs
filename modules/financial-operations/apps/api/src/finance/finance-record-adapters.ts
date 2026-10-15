import { CreateAccountInputV1Schema, UpdateAccountInputV1Schema } from '@gigalibs/contracts';
import {
  type IdempotencyStore,
  type LookupResolver,
  type ModulePrincipal,
  type RecordAction,
  type RecordAdapter,
  RecordDispatcher,
  type RecordFieldPolicy,
  type RecordListQuery,
  type RecordValues,
  RecordVersionConflict,
} from '@gigalibs/module-sdk';
import { shippedRecordRules } from '@gigalibs/configuration-core';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { FinanceEntity, FinancePage, FinanceRecordsService } from './finance-records.service.js';
import type { FinanceService } from './finance.service.js';
import { FinanceVersionConflict, type JournalDraftsService } from './journal-drafts.service.js';

// WI-OI-120l (U12, ADR-0033 D1): the general ledger's record adapters behind its metadata windows. Window field keys are
// the dictionary's kebab-case keys; the domain speaks camelCase. Every command goes through FinanceService or
// JournalDraftsService with the permissions of Finance's own routes; manual journals are drafted, submitted and approved
// by a second person before they post (owner decision 2026-10-06, Option A).

const camel = (key: string) => key.replace(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());

interface FieldSpec {
  readonly key: string;
  readonly writable?: boolean;
}

const policies = (fields: readonly FieldSpec[]): Record<string, RecordFieldPolicy> =>
  Object.fromEntries(fields.map((field) => [field.key, { writable: field.writable ?? false }]));

function toWindow(fields: readonly FieldSpec[], record: Readonly<Record<string, unknown>>): RecordValues {
  const values: Record<string, unknown> = { id: record.id };
  if (record.version !== undefined) values.version = record.version;
  for (const field of fields) values[field.key] = record[camel(field.key)] ?? null;
  return values;
}

function toDomain(fields: readonly FieldSpec[], values: RecordValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in values)) continue;
    const value = values[field.key];
    if (value === null || value === '') continue;
    input[camel(field.key)] = value;
  }
  return input;
}

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
function parse<T>(schema: Schema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: `${issue?.path.join('.') || 'value'}: ${issue?.message ?? 'invalid'}` });
}

/** A Finance version conflict becomes the window's 412. */
async function versioned<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FinanceVersionConflict) throw new RecordVersionConflict();
    if (error instanceof ConflictException && /version|changed by someone else/i.test(JSON.stringify(error.getResponse()))) throw new RecordVersionConflict();
    throw error;
  }
}

function text(parameters: RecordValues, key: string, required: boolean, label: string): string | undefined {
  const value = typeof parameters[key] === 'string' ? (parameters[key] as string).trim() : '';
  if (!value && required) throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: `${label} is required.` });
  return value || undefined;
}

function expectedVersion(parameters: RecordValues): number {
  const version = parameters['expectedVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: 'The version the change was made against is required.' });
  }
  return version;
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

const pageOf = (fields: readonly FieldSpec[], page: FinancePage) => ({ ...page, items: page.items.map((item) => toWindow(fields, item)) });

const BOOK_FIELDS: readonly FieldSpec[] = [
  { key: 'book-code' }, { key: 'book-name' }, { key: 'currency-code' }, { key: 'costing-method' }, { key: 'is-primary' }, { key: 'status' },
];
const ACCOUNT_FIELDS: readonly FieldSpec[] = [
  { key: 'accounting-book-id', writable: true },
  { key: 'account-code', writable: true },
  { key: 'account-name', writable: true },
  { key: 'account-class', writable: true },
  { key: 'account-subtype', writable: true },
  { key: 'normal-balance', writable: true },
  { key: 'parent-account-id', writable: true },
  { key: 'is-reconcilable', writable: true },
  { key: 'is-subledger-control', writable: true },
  { key: 'active', writable: true },
];
const PERIOD_FIELDS: readonly FieldSpec[] = [
  { key: 'accounting-book-id' }, { key: 'period-number' }, { key: 'period-name' }, { key: 'start-date' }, { key: 'end-date' }, { key: 'status' },
];
const JOURNAL_FIELDS: readonly FieldSpec[] = [
  { key: 'journal-number' }, { key: 'accounting-book-id' }, { key: 'posting-date' }, { key: 'entry-type' }, { key: 'description' },
  { key: 'status' }, { key: 'total-debit-minor' }, { key: 'total-credit-minor' }, { key: 'source-document-type' },
  { key: 'reversed-journal-id' }, { key: 'posted-by' },
];
const JOURNAL_LINE_FIELDS: readonly FieldSpec[] = [
  { key: 'journal-id' }, { key: 'line-number' }, { key: 'account-id' }, { key: 'debit-amount-minor' }, { key: 'credit-amount-minor' },
  { key: 'currency-code' }, { key: 'memo' },
];
const DRAFT_FIELDS: readonly FieldSpec[] = [
  { key: 'accounting-book-id', writable: true },
  { key: 'posting-date', writable: true },
  { key: 'entry-type', writable: true },
  { key: 'description', writable: true },
  { key: 'status' },
  { key: 'total-debit-minor' },
  { key: 'total-credit-minor' },
  { key: 'line-count' },
  { key: 'submitted-by' },
  { key: 'approved-by' },
  { key: 'returned-reason' },
  { key: 'posted-journal-id' },
  { key: 'updated-at' },
];
const DRAFT_LINE_FIELDS: readonly FieldSpec[] = [
  { key: 'draft-id', writable: true },
  { key: 'line-number' },
  { key: 'account-id', writable: true },
  { key: 'debit-amount-minor', writable: true },
  { key: 'credit-amount-minor', writable: true },
  { key: 'memo', writable: true },
  { key: 'draft-status' },
];

export interface FinanceRecordDependencies {
  readonly finance: Pick<FinanceService, 'createAccount' | 'updateAccount' | 'updatePeriodStatus' | 'reverseJournal'>;
  readonly drafts: Pick<JournalDraftsService, 'create' | 'update' | 'addLine' | 'removeLine' | 'submit' | 'approve' | 'returnToDraft'>;
  readonly records: Pick<FinanceRecordsService, 'page' | 'get' | 'lookup'>;
}

function readAdapter(
  deps: FinanceRecordDependencies,
  entityKey: string,
  entity: FinanceEntity,
  fields: readonly FieldSpec[],
  options: { search?: readonly string[]; filter?: readonly string[]; sort?: readonly string[]; parent?: string } = {},
): RecordAdapter {
  return {
    entityKey,
    permissions: { read: 'finance:read' },
    fields: policies(fields),
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

/** The general ledger's record dispatcher: books, accounts, periods, posted journals and journal drafts. */
export function financeRecordDispatcher(deps: FinanceRecordDependencies, idempotency: IdempotencyStore): RecordDispatcher {
  const books: RecordAdapter = {
    rest: { read: 'GET v1/books' },
    ...readAdapter(deps, 'finance.books', 'books', BOOK_FIELDS, { search: ['book-code', 'book-name'], filter: ['status'], sort: ['book-code', 'book-name'] }),
  };

  const accounts: RecordAdapter = {
    rest: { read: 'GET v1/accounts', create: 'POST v1/accounts', update: 'PUT v1/accounts/{id}' },
    ...readAdapter(deps, 'finance.accounts', 'accounts', ACCOUNT_FIELDS, {
      search: ['account-code', 'account-name'], filter: ['accounting-book-id', 'account-class', 'account-subtype'], sort: ['account-code', 'account-name'],
    }),
    permissions: { read: 'finance:read', create: 'finance:coa:manage', update: 'finance:coa:manage' },
    async create(context, values) {
      const { active: _active, ...fields } = toDomain(ACCOUNT_FIELDS, values);
      const input = parse(CreateAccountInputV1Schema, fields);
      return toWindow(ACCOUNT_FIELDS, { ...(await deps.finance.createAccount(context.principal.tenantId, context.principal.subject, input)) });
    },
    async update(context, id, values, version) {
      const { accountName, parentAccountId, isReconcilable, active, ...fixed } = toDomain(ACCOUNT_FIELDS, values);
      if (Object.keys(fixed).length > 0) {
        throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: "An account's book, code, class, subtype and normal balance cannot change." });
      }
      const input = parse(UpdateAccountInputV1Schema, { expectedVersion: version, accountName, parentAccountId, isReconcilable, active });
      return toWindow(ACCOUNT_FIELDS, { ...(await versioned(() => deps.finance.updateAccount(context.principal.tenantId, context.principal.subject, id, input))) });
    },
  };

  const periodAction = (status: 'OPEN' | 'SOFT_CLOSED' | 'LOCKED'): RecordAction => ({
    permission: 'finance:periods:manage',
    async run(context, id, parameters) {
      const reason = text(parameters, 'reason', status !== 'OPEN', 'A reason');
      const period = await deps.finance.updatePeriodStatus(context.principal.tenantId, context.principal.subject, id, { status, ...(reason ? { reason } : {}) });
      return toWindow(PERIOD_FIELDS, { ...period });
    },
  });
  const periods: RecordAdapter = {
    rest: {
      read: 'GET v1/fiscal-periods',
      actions: {
        open: 'PUT v1/fiscal-periods/{id}/status',
        'soft-close': 'PUT v1/fiscal-periods/{id}/status',
        lock: 'PUT v1/fiscal-periods/{id}/status',
      },
    },
    ...readAdapter(deps, 'finance.periods', 'periods', PERIOD_FIELDS, { search: ['period-name'], filter: ['accounting-book-id', 'status'], sort: ['start-date', 'period-name'] }),
    actions: { open: periodAction('OPEN'), 'soft-close': periodAction('SOFT_CLOSED'), lock: periodAction('LOCKED') },
  };

  const journals: RecordAdapter = {
    rest: { read: 'GET v1/journals', actions: { reverse: 'POST v1/journals/{id}/reverse' } },
    ...readAdapter(deps, 'finance.journals', 'journals', JOURNAL_FIELDS, {
      search: ['journal-number', 'description'], filter: ['accounting-book-id', 'status', 'entry-type'], sort: ['posting-date', 'journal-number'],
    }),
    actions: {
      reverse: {
        permission: 'finance:journals:reverse',
        async run(context, id, parameters) {
          const reason = text(parameters, 'reason', true, 'A reason')!;
          const date = text(parameters, 'reversal-date', false, 'The reversal date') ?? new Date().toISOString().slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: 'The reversal date is YYYY-MM-DD.' });
          const { original } = await deps.finance.reverseJournal(context.principal.tenantId, context.principal.subject, { journalId: id, reversalPostingDate: date, reason });
          return toWindow(JOURNAL_FIELDS, { ...original, status: 'REVERSED' });
        },
      },
    },
  };
  const journalLines: RecordAdapter = {
    rest: { read: 'GET v1/journals' },
    ...readAdapter(deps, 'finance.journal-lines', 'journalLines', JOURNAL_LINE_FIELDS, { sort: ['line-number'], parent: 'journal-id' }),
  };

  const drafts: RecordAdapter = {
    // A draft prepares a journal, which REST posts directly (POST v1/journals). Approving and returning are
    // the maker-checker step, which REST does not have.
    rest: {
      read: 'GET v1/journals',
      create: 'POST v1/journals',
      update: 'POST v1/journals',
      actions: { submit: 'POST v1/journals', approve: null, return: null },
    },
    ...readAdapter(deps, 'finance.journal-drafts', 'drafts', DRAFT_FIELDS, { search: ['description'], filter: ['accounting-book-id', 'status'], sort: ['posting-date', 'updated-at'] }),
    permissions: { read: 'finance:read', create: 'finance:journals:post', update: 'finance:journals:post' },
    async create(context, values) {
      const input = toDomain(DRAFT_FIELDS, values) as { accountingBookId?: string; postingDate?: string; description?: string; entryType?: string };
      if (!input.accountingBookId || !input.postingDate || !input.description) {
        throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: 'A book, a posting date and a description are required.' });
      }
      const draft = await deps.drafts.create(context.principal.tenantId, context.principal.subject, {
        accountingBookId: input.accountingBookId, postingDate: input.postingDate, description: input.description, ...(input.entryType ? { entryType: input.entryType } : {}),
      });
      return toWindow(DRAFT_FIELDS, { ...draft });
    },
    async update(context, id, values, version) {
      const { accountingBookId, ...changes } = toDomain(DRAFT_FIELDS, values) as { accountingBookId?: string; postingDate?: string; description?: string; entryType?: string };
      if (accountingBookId) throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: "A journal's book cannot change; start a new draft." });
      return toWindow(DRAFT_FIELDS, { ...(await versioned(() => deps.drafts.update(context.principal.tenantId, context.principal.subject, id, changes, version))) });
    },
    actions: {
      submit: {
        permission: 'finance:journals:post',
        async run(context, id, parameters) {
          return toWindow(DRAFT_FIELDS, { ...(await versioned(() => deps.drafts.submit(context.principal.tenantId, context.principal.subject, id, expectedVersion(parameters)))) });
        },
      },
      approve: {
        permission: 'finance:journals:approve',
        async run(context, id, parameters) {
          const reason = text(parameters, 'reason', true, 'A reason')!;
          return toWindow(DRAFT_FIELDS, { ...(await versioned(() => deps.drafts.approve(context.principal.tenantId, context.principal.subject, id, expectedVersion(parameters), reason))) });
        },
      },
      return: {
        permission: 'finance:journals:approve',
        async run(context, id, parameters) {
          const reason = text(parameters, 'reason', true, 'A reason')!;
          return toWindow(DRAFT_FIELDS, { ...(await versioned(() => deps.drafts.returnToDraft(context.principal.tenantId, context.principal.subject, id, expectedVersion(parameters), reason))) });
        },
      },
    },
  };

  const draftLines: RecordAdapter = {
    // A draft's lines prepare a journal's lines, which REST posts with the journal (POST v1/journals).
    rest: {
      read: 'GET v1/journals',
      create: 'POST v1/journals',
      actions: { remove: 'POST v1/journals' },
    },
    ...readAdapter(deps, 'finance.journal-draft-lines', 'draftLines', DRAFT_LINE_FIELDS, { sort: ['line-number'], parent: 'draft-id' }),
    permissions: { read: 'finance:read', create: 'finance:journals:post' },
    async create(context, values) {
      const { draftId, accountId, debitAmountMinor, creditAmountMinor, memo } = toDomain(DRAFT_LINE_FIELDS, values) as Record<string, string | undefined>;
      if (!draftId || !accountId) throw new BadRequestException({ code: 'FINANCE_VALIDATION_FAILED', message: 'An account is required.' });
      const line = await deps.drafts.addLine(context.principal.tenantId, context.principal.subject, draftId, {
        accountId,
        ...(debitAmountMinor ? { debitAmountMinor: String(debitAmountMinor) } : {}),
        ...(creditAmountMinor ? { creditAmountMinor: String(creditAmountMinor) } : {}),
        ...(memo ? { memo } : {}),
      });
      return toWindow(DRAFT_LINE_FIELDS, { ...line });
    },
    actions: {
      remove: {
        permission: 'finance:journals:post',
        async run(context, id) {
          return toWindow(DRAFT_LINE_FIELDS, { ...(await deps.drafts.removeLine(context.principal.tenantId, context.principal.subject, id)), draftStatus: 'REMOVED' });
        },
      },
    },
  };

  const resolvers: LookupResolver[] = [
    { key: 'finance-books', permission: 'finance:read', resolve: (principal, request) => deps.records.lookup(principal, 'books', request) },
    { key: 'finance-accounts', permission: 'finance:read', resolve: (principal, request) => deps.records.lookup(principal, 'accounts', request) },
  ];

  // WI-OI-120r (S1): the field rules of Finance's windows, enforced on every create and change.
  return new RecordDispatcher([books, accounts, periods, journals, journalLines, drafts, draftLines], resolvers, idempotency, shippedRecordRules('financial-operations'));
}
