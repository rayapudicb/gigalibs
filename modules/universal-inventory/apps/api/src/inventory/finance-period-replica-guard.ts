import { DocumentGuardRefusedError } from '@gigalibs/document-lifecycle';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';

type FinancePostingContextError = 'FINANCE_BOOK_MISSING' | 'FINANCE_PERIOD_MISSING' | 'FINANCE_PERIOD_LOCKED';

function financePostingContextRefusal(code: FinancePostingContextError, postingDate: string): string {
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

/** Calendar posting date (YYYY-MM-DD) from the receipt timestamp — duplicated from posting-rules to avoid cross-module import. */
export function inventoryReceiptPostingDate(receivedAt: string): string {
  const trimmed = receivedAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) throw new Error('The receipt timestamp is not a valid date.');
  return new Date(parsed).toISOString().slice(0, 10);
}

async function resolveReplicaPostingContext(
  client: PoolClient,
  tenantId: string,
  postingDate: string,
): Promise<FinancePostingContextError | { readonly ok: true }> {
  const meta = await client.query<{ primary_book_id: string | null; initial_sync_completed_at: string | null }>(
    `SELECT primary_book_id, initial_sync_completed_at FROM ${SCHEMA}.finance_period_replica_meta WHERE tenant_id = $1`,
    [tenantId],
  );
  const row = meta.rows[0];
  if (!row?.initial_sync_completed_at) return { ok: true as const };

  const bookId = row.primary_book_id;
  if (!bookId) return 'FINANCE_BOOK_MISSING';

  const period = await client.query<{ status: string }>(
    `SELECT status FROM ${SCHEMA}.finance_fiscal_period_replica
      WHERE tenant_id = $1 AND accounting_book_id = $2
        AND start_date <= $3::date AND end_date >= $3::date
      ORDER BY start_date DESC
      LIMIT 1`,
    [tenantId, bookId, postingDate],
  );
  if (!period.rows[0]) return 'FINANCE_PERIOD_MISSING';
  if (period.rows[0].status === 'LOCKED') return 'FINANCE_PERIOD_LOCKED';
  return { ok: true };
}

/** WI-OI-120bp (D1): refuse receipt complete when the local Finance fiscal replica says the period is locked or missing. */
export async function assertInventoryReceiptFinancePeriodOpenFromReplica(
  client: PoolClient,
  tenantId: string,
  receivedAtIso: string,
): Promise<void> {
  const postingDate = inventoryReceiptPostingDate(receivedAtIso);
  const result = await resolveReplicaPostingContext(client, tenantId, postingDate);
  if (typeof result === 'string') {
    throw new DocumentGuardRefusedError('complete', financePostingContextRefusal(result, postingDate));
  }
}
