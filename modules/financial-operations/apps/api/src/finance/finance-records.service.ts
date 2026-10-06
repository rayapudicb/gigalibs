import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { LookupOption, ModulePrincipal } from '@gigalibs/module-sdk';
import type pg from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { FinanceService } from './finance.service.js';
import { DRAFT_COLUMNS, mapDraft, mapDraftLine } from './journal-drafts.service.js';

// WI-OI-120l (U12, ADR-0033 D1): the paged, tenant-bound reads the general ledger's metadata windows need, beside the
// domain service. Every query binds the tenant (forced row-level security plus tenant_id), pages in SQL, and accepts
// only the columns each entity declares for search, filter and sort; values are always bound parameters.

export type FinanceEntity = 'books' | 'accounts' | 'periods' | 'journals' | 'journalLines' | 'drafts' | 'draftLines';

export interface FinancePageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly sortField?: string;
  readonly sortDirection: 'ASC' | 'DESC';
  readonly filters: Readonly<Record<string, string>>;
  readonly parentId?: string;
}

export interface FinancePage {
  readonly items: readonly Record<string, unknown>[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

interface EntitySpec {
  readonly from: string;
  readonly select: string;
  readonly search: readonly string[];
  readonly filter: Readonly<Record<string, string>>;
  readonly sort: Readonly<Record<string, string>>;
  readonly defaultSort: string;
  readonly parent?: string;
  readonly map: (row: any) => Record<string, unknown>;
}

const t = (table: string) => `${SCHEMA}.${table}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const like = (text: string) => `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;

@Injectable()
export class FinanceRecordsService {
  private readonly specs: Readonly<Record<FinanceEntity, EntitySpec>>;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FinanceService) finance: FinanceService,
  ) {
    const journalLine = (row: any) => ({ ...finance.mapJournalLine(row) });
    this.specs = {
      books: {
        from: `${t('accounting_books')} r`, select: 'r.*', search: ['r.book_code', 'r.book_name'], filter: { status: 'r.status' },
        sort: { bookCode: 'r.book_code', bookName: 'r.book_name' }, defaultSort: 'r.book_code', map: (row) => ({ ...finance.mapAccountingBook(row) }),
      },
      accounts: {
        from: `${t('chart_of_accounts')} r`, select: 'r.*', search: ['r.account_code', 'r.account_name'],
        filter: { accountingBookId: 'r.accounting_book_id', accountClass: 'r.account_class', accountSubtype: 'r.account_subtype' },
        sort: { accountCode: 'r.account_code', accountName: 'r.account_name' }, defaultSort: 'r.account_code',
        map: (row) => ({ ...finance.mapAccount(row) }),
      },
      periods: {
        from: `${t('fiscal_periods')} r`, select: 'r.*', search: ['r.period_name'], filter: { accountingBookId: 'r.accounting_book_id', status: 'r.status' },
        sort: { startDate: 'r.start_date', periodName: 'r.period_name' }, defaultSort: 'r.start_date', map: (row) => ({ ...finance.mapFiscalPeriod(row) }),
      },
      journals: {
        from: `${t('gl_journals')} r`, select: 'r.*', search: ['r.journal_number', 'r.description'],
        filter: { accountingBookId: 'r.accounting_book_id', status: 'r.status', entryType: 'r.entry_type' },
        sort: { postingDate: 'r.posting_date', journalNumber: 'r.journal_number' }, defaultSort: 'r.posting_date',
        map: (row) => ({ ...finance.mapJournal(row, []) }),
      },
      journalLines: {
        from: `${t('gl_journal_lines')} r LEFT JOIN ${t('chart_of_accounts')} a ON a.tenant_id = r.tenant_id AND a.id = r.account_id`,
        select: 'r.*, a.account_code, a.account_name', search: [], filter: {}, sort: { lineNumber: 'r.line_number' }, defaultSort: 'r.line_number',
        parent: 'r.journal_id', map: journalLine,
      },
      drafts: {
        from: `${t('gl_journal_drafts')} d`, select: DRAFT_COLUMNS, search: ['d.description'],
        filter: { accountingBookId: 'd.accounting_book_id', status: 'd.status' },
        sort: { postingDate: 'd.posting_date', updatedAt: 'd.updated_at' }, defaultSort: 'd.updated_at', map: (row) => ({ ...mapDraft(row) }),
      },
      draftLines: {
        from: `${t('gl_journal_draft_lines')} r JOIN ${t('gl_journal_drafts')} d ON d.tenant_id = r.tenant_id AND d.id = r.draft_id`,
        select: 'r.*, d.status AS draft_status', search: [], filter: {}, sort: { lineNumber: 'r.line_number' }, defaultSort: 'r.line_number',
        parent: 'r.draft_id', map: (row) => ({ ...mapDraftLine(row) }),
      },
    };
  }

  page(principal: ModulePrincipal, entity: FinanceEntity, query: FinancePageQuery): Promise<FinancePage> {
    const spec = this.specs[entity];
    const alias = spec.from.split(' ')[1]!;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const values: unknown[] = [principal.tenantId];
      const where = [`${alias}.tenant_id = $1`];
      if (query.parentId !== undefined) {
        if (!spec.parent) throw new BadRequestException(`${entity} has no parent.`);
        if (!UUID.test(query.parentId)) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
        values.push(query.parentId);
        where.push(`${spec.parent} = $${values.length}`);
      }
      if (query.search && spec.search.length > 0) {
        values.push(like(query.search));
        where.push(`(${spec.search.map((column) => `${column} ILIKE $${values.length}`).join(' OR ')})`);
      }
      for (const [field, value] of Object.entries(query.filters)) {
        const column = spec.filter[field];
        if (!column) throw new BadRequestException(`${entity} cannot be filtered by ${field}.`);
        values.push(value);
        where.push(`${column} = $${values.length}`);
      }
      const sortColumn = query.sortField ? spec.sort[query.sortField] : spec.defaultSort;
      if (!sortColumn) throw new BadRequestException(`${entity} cannot be sorted by ${query.sortField}.`);
      const direction = query.sortDirection === 'DESC' ? 'DESC' : 'ASC';
      const count = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${spec.from} WHERE ${where.join(' AND ')}`, values);
      values.push(query.pageSize, (query.page - 1) * query.pageSize);
      const result = await client.query(
        `SELECT ${spec.select} FROM ${spec.from} WHERE ${where.join(' AND ')}
          ORDER BY ${sortColumn} ${direction}, ${alias}.id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return { items: result.rows.map((row) => spec.map(row)), total: Number(count.rows[0]?.n ?? 0), page: query.page, pageSize: query.pageSize };
    });
  }

  get(principal: ModulePrincipal, entity: FinanceEntity, id: string): Promise<Record<string, unknown> | null> {
    if (!UUID.test(id)) return Promise.resolve(null);
    const spec = this.specs[entity];
    const alias = spec.from.split(' ')[1]!;
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query(`SELECT ${spec.select} FROM ${spec.from} WHERE ${alias}.tenant_id = $1 AND ${alias}.id = $2`, [principal.tenantId, id]);
      return result.rows[0] ? spec.map(result.rows[0]) : null;
    });
  }

  /** Picker options: books (`code — name`) or accounts (`code — name · book`), by text or by ids. */
  lookup(principal: ModulePrincipal, entity: 'books' | 'accounts', request: { readonly search?: string; readonly ids?: readonly string[]; readonly limit: number }): Promise<readonly LookupOption[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: pg.PoolClient) => {
      const values: unknown[] = [principal.tenantId];
      const books = entity === 'books';
      const [code, name] = books ? ['r.book_code', 'r.book_name'] : ['r.account_code', 'r.account_name'];
      const where = ['r.tenant_id = $1'];
      if (request.ids?.length) {
        values.push(request.ids);
        where.push(`r.id = ANY($${values.length}::uuid[])`);
      } else {
        where.push(books ? "r.status = 'ACTIVE'" : 'r.active = true');
        if (request.search) {
          values.push(like(request.search));
          where.push(`(${code} ILIKE $${values.length} OR ${name} ILIKE $${values.length})`);
        }
      }
      values.push(request.limit);
      const result = await client.query(
        books
          ? `SELECT r.id, ${code} || ' — ' || ${name} AS label FROM ${t('accounting_books')} r WHERE ${where.join(' AND ')} ORDER BY ${code} LIMIT $${values.length}`
          : `SELECT r.id, ${code} || ' — ' || ${name} || ' · ' || b.book_code AS label FROM ${t('chart_of_accounts')} r
               JOIN ${t('accounting_books')} b ON b.tenant_id = r.tenant_id AND b.id = r.accounting_book_id
              WHERE ${where.join(' AND ')} ORDER BY ${code} LIMIT $${values.length}`,
        values,
      );
      return result.rows.map((row) => ({ value: String(row.id), label: String(row.label) }));
    });
  }
}
