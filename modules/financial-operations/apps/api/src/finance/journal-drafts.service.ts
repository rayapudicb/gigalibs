import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { FinanceService } from './finance.service.js';
import { runJournalDraftTransition, type JournalDraftLifecycleDeps } from './journal-draft-lifecycle.js';

// WI-OI-120l (U12, owner decision 2026-10-06 "Option A"): manual journals are drafted, submitted and approved by a second
// person before they post. A draft finds its fiscal period from its posting date; its lines name accounts of its own
// book; submitting needs at least two lines that balance; approving posts through FinanceService.postJournal in the
// same transaction, with the draft as source document, so an approval retried after a failure posts at most once.
// The database refuses an approval by the person who submitted (constraint gl_journal_drafts_second_person).

export type DraftStatus = 'DRAFT' | 'SUBMITTED' | 'POSTED';
const ENTRY_TYPES = ['STANDARD_MANUAL', 'OPENING_BALANCE'] as const;

/** The draft changed since the caller read it; the record adapter answers 412. */
export class FinanceVersionConflict extends ConflictException {
  constructor() {
    super({ code: 'FINANCE_VERSION_CONFLICT', message: 'The journal draft was changed by someone else; reload it and try again.' });
  }
}

export interface JournalDraftV1 {
  readonly id: string;
  readonly accountingBookId: string;
  readonly fiscalPeriodId: string;
  readonly postingDate: string;
  readonly entryType: string;
  readonly description: string;
  readonly status: DraftStatus;
  readonly totalDebitMinor: string;
  readonly totalCreditMinor: string;
  readonly lineCount: number;
  readonly submittedBy: string | null;
  readonly submittedAt: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly returnedReason: string | null;
  readonly postedJournalId: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface JournalDraftLineV1 {
  readonly id: string;
  readonly draftId: string;
  readonly draftStatus: DraftStatus;
  readonly lineNumber: number;
  readonly accountId: string;
  readonly debitAmountMinor: string;
  readonly creditAmountMinor: string;
  readonly memo: string | null;
  readonly createdAt: string;
}

const day = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const at = (value: unknown) => (value ? new Date(value as string).toISOString() : null);
const MINOR = /^\d{1,15}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DRAFT_COLUMNS = `d.*,
  COALESCE((SELECT sum(l.debit_amount_minor) FROM ${SCHEMA}.gl_journal_draft_lines l WHERE l.tenant_id = d.tenant_id AND l.draft_id = d.id), 0)::text AS total_debit_minor,
  COALESCE((SELECT sum(l.credit_amount_minor) FROM ${SCHEMA}.gl_journal_draft_lines l WHERE l.tenant_id = d.tenant_id AND l.draft_id = d.id), 0)::text AS total_credit_minor,
  (SELECT count(*) FROM ${SCHEMA}.gl_journal_draft_lines l WHERE l.tenant_id = d.tenant_id AND l.draft_id = d.id)::int AS line_count`;

export function mapDraft(row: Record<string, unknown>): JournalDraftV1 {
  return {
    id: String(row.id),
    accountingBookId: String(row.accounting_book_id),
    fiscalPeriodId: String(row.fiscal_period_id),
    postingDate: day(row.posting_date),
    entryType: String(row.entry_type),
    description: String(row.description),
    status: row.status as DraftStatus,
    totalDebitMinor: String(row.total_debit_minor ?? '0'),
    totalCreditMinor: String(row.total_credit_minor ?? '0'),
    lineCount: Number(row.line_count ?? 0),
    submittedBy: (row.submitted_by as string) ?? null,
    submittedAt: at(row.submitted_at),
    approvedBy: (row.approved_by as string) ?? null,
    approvedAt: at(row.approved_at),
    returnedReason: (row.returned_reason as string) ?? null,
    postedJournalId: (row.posted_journal_id as string) ?? null,
    version: Number(row.version),
    createdBy: String(row.created_by),
    createdAt: at(row.created_at)!,
    updatedAt: at(row.updated_at)!,
  };
}

export function mapDraftLine(row: Record<string, unknown>): JournalDraftLineV1 {
  return {
    id: String(row.id),
    draftId: String(row.draft_id),
    draftStatus: row.draft_status as DraftStatus,
    lineNumber: Number(row.line_number),
    accountId: String(row.account_id),
    debitAmountMinor: String(row.debit_amount_minor),
    creditAmountMinor: String(row.credit_amount_minor),
    memo: (row.memo as string) ?? null,
    createdAt: at(row.created_at)!,
  };
}

@Injectable()
export class JournalDraftsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FinanceService) private readonly finance: FinanceService,
  ) {}

  async create(tenantId: string, actorId: string, input: { accountingBookId: string; postingDate: string; description: string; entryType?: string }): Promise<JournalDraftV1> {
    const description = input.description?.trim();
    if (!description) throw new BadRequestException('A description is required.');
    if (!DATE.test(input.postingDate)) throw new BadRequestException('The posting date must be a date (YYYY-MM-DD).');
    const entryType = input.entryType ?? 'STANDARD_MANUAL';
    if (!(ENTRY_TYPES as readonly string[]).includes(entryType)) throw new BadRequestException('A manual journal is a standard or an opening-balance entry.');
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.activeBook(client, tenantId, input.accountingBookId);
      const periodId = await this.periodFor(client, tenantId, input.accountingBookId, input.postingDate);
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.gl_journal_drafts (tenant_id, accounting_book_id, fiscal_period_id, posting_date, entry_type, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tenantId, input.accountingBookId, periodId, input.postingDate, entryType, description, actorId],
      );
      const id = String(inserted.rows[0].id);
      await this.audit(client, tenantId, id, 'JOURNAL_DRAFT_CREATED', actorId, { accountingBookId: input.accountingBookId, postingDate: input.postingDate });
      return this.read(client, tenantId, id);
    });
  }

  async update(tenantId: string, actorId: string, id: string, changes: { postingDate?: string; description?: string; entryType?: string }, expectedVersion: number): Promise<JournalDraftV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const draft = await this.locked(client, tenantId, id, expectedVersion, ['DRAFT']);
      const postingDate = changes.postingDate ?? draft.postingDate;
      if (!DATE.test(postingDate)) throw new BadRequestException('The posting date must be a date (YYYY-MM-DD).');
      const entryType = changes.entryType ?? draft.entryType;
      if (!(ENTRY_TYPES as readonly string[]).includes(entryType)) throw new BadRequestException('A manual journal is a standard or an opening-balance entry.');
      const description = (changes.description ?? draft.description).trim();
      if (!description) throw new BadRequestException('A description is required.');
      const periodId = await this.periodFor(client, tenantId, draft.accountingBookId, postingDate);
      await client.query(
        `UPDATE ${SCHEMA}.gl_journal_drafts SET posting_date = $3, fiscal_period_id = $4, entry_type = $5, description = $6,
                version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, postingDate, periodId, entryType, description],
      );
      await this.audit(client, tenantId, id, 'JOURNAL_DRAFT_UPDATED', actorId, { changed: Object.keys(changes) });
      return this.read(client, tenantId, id);
    });
  }

  async addLine(tenantId: string, actorId: string, draftId: string, input: { accountId: string; debitAmountMinor?: string; creditAmountMinor?: string; memo?: string }): Promise<JournalDraftLineV1> {
    const debit = input.debitAmountMinor ?? '0';
    const credit = input.creditAmountMinor ?? '0';
    if (!MINOR.test(debit) || !MINOR.test(credit)) throw new BadRequestException('Amounts are whole minor units (1250 is 12.50), not negative.');
    if ((BigInt(debit) > 0n) === (BigInt(credit) > 0n)) throw new BadRequestException('A line has either a debit or a credit amount, not both or neither.');
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const draft = await this.lockedAny(client, tenantId, draftId, ['DRAFT']);
      const account = await client.query(
        `SELECT active FROM ${SCHEMA}.chart_of_accounts WHERE tenant_id = $1 AND id = $2 AND accounting_book_id = $3`,
        [tenantId, input.accountId, draft.accountingBookId],
      );
      if (!account.rows[0]) throw new BadRequestException("The account is not in this journal's book.");
      if (!account.rows[0].active) throw new BadRequestException('The account is inactive.');
      const next = await client.query(
        `SELECT COALESCE(max(line_number), 0) + 1 AS n FROM ${SCHEMA}.gl_journal_draft_lines WHERE tenant_id = $1 AND draft_id = $2`,
        [tenantId, draftId],
      );
      const inserted = await client.query(
        `INSERT INTO ${SCHEMA}.gl_journal_draft_lines (tenant_id, draft_id, line_number, account_id, debit_amount_minor, credit_amount_minor, memo)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tenantId, draftId, Number(next.rows[0].n), input.accountId, debit, credit, input.memo?.trim() || null],
      );
      await this.advance(client, tenantId, draftId);
      await this.audit(client, tenantId, draftId, 'JOURNAL_DRAFT_LINE_ADDED', actorId, { accountId: input.accountId, debit, credit });
      return this.readLine(client, tenantId, String(inserted.rows[0].id));
    });
  }

  async removeLine(tenantId: string, actorId: string, lineId: string): Promise<JournalDraftLineV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const line = await this.readLine(client, tenantId, lineId);
      await this.lockedAny(client, tenantId, line.draftId, ['DRAFT']);
      await client.query(`DELETE FROM ${SCHEMA}.gl_journal_draft_lines WHERE tenant_id = $1 AND id = $2`, [tenantId, lineId]);
      await this.advance(client, tenantId, line.draftId);
      await this.audit(client, tenantId, line.draftId, 'JOURNAL_DRAFT_LINE_REMOVED', actorId, { lineNumber: line.lineNumber });
      return line;
    });
  }

  async submit(tenantId: string, actorId: string, id: string, expectedVersion: number): Promise<JournalDraftV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const draft = await this.locked(client, tenantId, id, expectedVersion, ['DRAFT']);
      return runJournalDraftTransition(this.lifecycleDeps(client, tenantId, actorId), draft, 'submit', expectedVersion);
    });
  }

  async approve(tenantId: string, actorId: string, id: string, expectedVersion: number, reason: string): Promise<JournalDraftV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const draft = await this.locked(client, tenantId, id, expectedVersion, ['SUBMITTED']);
      return runJournalDraftTransition(this.lifecycleDeps(client, tenantId, actorId), draft, 'approve', expectedVersion, {
        reason,
      });
    });
  }

  async returnToDraft(tenantId: string, actorId: string, id: string, expectedVersion: number, reason: string): Promise<JournalDraftV1> {
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const draft = await this.locked(client, tenantId, id, expectedVersion, ['SUBMITTED']);
      return runJournalDraftTransition(this.lifecycleDeps(client, tenantId, actorId), draft, 'returnToDraft', expectedVersion, {
        reason,
      });
    });
  }

  /** WI-OI-120fm (F1.2): persistence hooks for the shared document lifecycle runner. */
  private lifecycleDeps(client: PoolClient, tenantId: string, actorId: string): JournalDraftLifecycleDeps {
    return {
      client,
      tenantId,
      actorId,
      assertOpenPeriod: async (bookId, postingDate) => {
        await this.periodFor(client, tenantId, bookId, postingDate);
      },
      persistSubmit: async (draft) => {
        await client.query(
          `UPDATE ${SCHEMA}.gl_journal_drafts SET status = 'SUBMITTED', submitted_by = $3, submitted_at = now(), returned_reason = NULL,
                  version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
          [tenantId, draft.id, actorId],
        );
        await this.audit(client, tenantId, draft.id, 'JOURNAL_DRAFT_SUBMITTED', actorId, { totalMinor: draft.totalDebitMinor });
        return this.read(client, tenantId, draft.id);
      },
      persistApprove: async (draft, approvalReason) => {
        const lines = await client.query(
          `SELECT account_id, debit_amount_minor, credit_amount_minor, memo FROM ${SCHEMA}.gl_journal_draft_lines
            WHERE tenant_id = $1 AND draft_id = $2 ORDER BY line_number`,
          [tenantId, draft.id],
        );
        const journal = await this.finance.postJournal(
          tenantId,
          actorId,
          {
            accountingBookId: draft.accountingBookId,
            fiscalPeriodId: draft.fiscalPeriodId,
            postingDate: draft.postingDate,
            entryType: draft.entryType as 'STANDARD_MANUAL',
            sourceDocumentType: 'GL_JOURNAL_DRAFT',
            sourceDocumentId: draft.id,
            description: draft.description,
            lines: lines.rows.map((line) => ({
              accountId: String(line.account_id),
              debitAmountMinor: String(line.debit_amount_minor),
              creditAmountMinor: String(line.credit_amount_minor),
              exchangeRate: '1.000000',
              ...(line.memo ? { memo: String(line.memo) } : {}),
            })),
          },
          client,
        );
        await client.query(
          `UPDATE ${SCHEMA}.gl_journal_drafts SET status = 'POSTED', approved_by = $3, approved_at = now(), posted_journal_id = $4,
                  version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
          [tenantId, draft.id, actorId, journal.id],
        );
        await this.audit(client, tenantId, draft.id, 'JOURNAL_DRAFT_APPROVED', actorId, {
          journalId: journal.id,
          journalNumber: journal.journalNumber,
          reason: approvalReason,
        });
        return this.read(client, tenantId, draft.id);
      },
      persistReturn: async (draft, returnReason) => {
        await client.query(
          `UPDATE ${SCHEMA}.gl_journal_drafts SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL, returned_reason = $3,
                  version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
          [tenantId, draft.id, returnReason],
        );
        await this.audit(client, tenantId, draft.id, 'JOURNAL_DRAFT_RETURNED', actorId, { reason: returnReason });
        return this.read(client, tenantId, draft.id);
      },
    };
  }

  private async activeBook(client: PoolClient, tenantId: string, bookId: string): Promise<void> {
    const book = await client.query(`SELECT status FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`, [tenantId, bookId]);
    if (!book.rows[0]) throw new NotFoundException('The accounting book was not found.');
    if (book.rows[0].status !== 'ACTIVE') throw new BadRequestException('The accounting book is not active.');
  }

  /** The book's period covering the date; a locked period refuses new journals. */
  private async periodFor(client: PoolClient, tenantId: string, bookId: string, date: string): Promise<string> {
    const period = await client.query(
      `SELECT id, status, period_name FROM ${SCHEMA}.fiscal_periods
        WHERE tenant_id = $1 AND accounting_book_id = $2 AND start_date <= $3::date AND end_date >= $3::date
        ORDER BY start_date DESC LIMIT 1`,
      [tenantId, bookId, date],
    );
    const row = period.rows[0];
    if (!row) throw new BadRequestException(`No fiscal period covers ${date} in this book; set up its fiscal year first.`);
    if (row.status === 'LOCKED') throw new BadRequestException(`The period ${row.period_name} is locked.`);
    return String(row.id);
  }

  private async read(client: PoolClient, tenantId: string, id: string): Promise<JournalDraftV1> {
    const found = await client.query(`SELECT ${DRAFT_COLUMNS} FROM ${SCHEMA}.gl_journal_drafts d WHERE d.tenant_id = $1 AND d.id = $2`, [tenantId, id]);
    if (!found.rows[0]) throw new NotFoundException('The journal draft was not found.');
    return mapDraft(found.rows[0]);
  }

  private async readLine(client: PoolClient, tenantId: string, id: string): Promise<JournalDraftLineV1> {
    const found = await client.query(
      `SELECT l.*, d.status AS draft_status FROM ${SCHEMA}.gl_journal_draft_lines l
         JOIN ${SCHEMA}.gl_journal_drafts d ON d.tenant_id = l.tenant_id AND d.id = l.draft_id
        WHERE l.tenant_id = $1 AND l.id = $2`,
      [tenantId, id],
    );
    if (!found.rows[0]) throw new NotFoundException('The journal line was not found.');
    return mapDraftLine(found.rows[0]);
  }

  /** The draft, locked, at the caller's version and in one of the allowed states. */
  private async locked(client: PoolClient, tenantId: string, id: string, expectedVersion: number, states: readonly DraftStatus[]): Promise<JournalDraftV1> {
    const draft = await this.lockedAny(client, tenantId, id, states);
    if (draft.version !== expectedVersion) throw new FinanceVersionConflict();
    return draft;
  }

  private async lockedAny(client: PoolClient, tenantId: string, id: string, states: readonly DraftStatus[]): Promise<JournalDraftV1> {
    const lock = await client.query(`SELECT id FROM ${SCHEMA}.gl_journal_drafts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, id]);
    if (!lock.rows[0]) throw new NotFoundException('The journal draft was not found.');
    const draft = await this.read(client, tenantId, id);
    if (!states.includes(draft.status)) {
      throw new ConflictException({
        code: 'FINANCE_DRAFT_STATE',
        message: draft.status === 'POSTED' ? 'The journal is already posted; reverse it instead.' : `The journal is ${draft.status.toLowerCase()}, so it cannot change now.`,
      });
    }
    return draft;
  }

  private async advance(client: PoolClient, tenantId: string, id: string): Promise<void> {
    await client.query(`UPDATE ${SCHEMA}.gl_journal_drafts SET version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  }

  private async audit(client: PoolClient, tenantId: string, id: string, action: string, actorId: string, payload: unknown): Promise<void> {
    await client.query(
      `INSERT INTO ${SCHEMA}.audit_events (tenant_id, entity_type, entity_id, action, actor_id, payload) VALUES ($1, 'GL_JOURNAL_DRAFT', $2, $3, $4, $5)`,
      [tenantId, id, action, actorId, JSON.stringify(payload ?? {})],
    );
  }
}
