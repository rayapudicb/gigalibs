import type { PoolClient } from 'pg';

export type FinancePostingContext = {
  readonly bookId: string;
  readonly periodId: string;
  readonly postingDate: string;
};

export type FinancePostingContextError =
  | 'FINANCE_BOOK_MISSING'
  | 'FINANCE_PERIOD_MISSING'
  | 'FINANCE_PERIOD_LOCKED';

/** Primary (or first active) book and the open fiscal period covering the posting date (ADR-0033 F2 / F1.4). */
export async function resolvePrimaryBookPostingContext(
  client: PoolClient,
  schema: string,
  tenantId: string,
  postingDate: string,
): Promise<FinancePostingContext | FinancePostingContextError> {
  const book = await client.query<{ id: string }>(
    `SELECT id FROM ${schema}.accounting_books
      WHERE tenant_id = $1 AND status = 'ACTIVE'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1`,
    [tenantId],
  );
  const bookId = book.rows[0]?.id;
  if (!bookId) return 'FINANCE_BOOK_MISSING';

  const period = await client.query<{ id: string; status: string; period_name: string }>(
    `SELECT id, status, period_name FROM ${schema}.fiscal_periods
      WHERE tenant_id = $1 AND accounting_book_id = $2
        AND start_date <= $3::date AND end_date >= $3::date
      ORDER BY start_date DESC
      LIMIT 1`,
    [tenantId, bookId, postingDate],
  );
  const row = period.rows[0];
  if (!row) return 'FINANCE_PERIOD_MISSING';
  if (row.status === 'LOCKED') return 'FINANCE_PERIOD_LOCKED';

  return { bookId, periodId: String(row.id), postingDate };
}

/** User-facing refusal for lifecycle guards when Finance posting context is unavailable. */
export function financePostingContextRefusal(code: FinancePostingContextError, postingDate: string): string {
  switch (code) {
    case 'FINANCE_BOOK_MISSING':
      return 'Finance has no active accounting book; set up Finance before completing receipts that post to the ledger.';
    case 'FINANCE_PERIOD_MISSING':
      return `No fiscal period covers ${postingDate}; open or extend the fiscal calendar in Finance first.`;
    case 'FINANCE_PERIOD_LOCKED':
      return `The fiscal period for ${postingDate} is locked; reopen it in Finance or choose another receipt date.`;
    default:
      return 'Finance posting period check failed.';
  }
}
