import { DocumentGuardRefusedError } from '@gigalibs/document-lifecycle';
import {
  financePostingContextRefusal,
  inventoryReceiptPostingDate,
  resolvePrimaryBookPostingContext,
} from '@gigalibs/posting-rules';
import pg from 'pg';

const FINANCE_SCHEMA = 'gigalibs_finance';

let financePeriodPool: pg.Pool | null = null;

function financePeriodLockDatabaseUrl(): string | null {
  const explicit = process.env.FINANCE_PERIOD_LOCK_DATABASE_URL?.trim();
  if (explicit) return explicit;
  return process.env.FINANCIAL_OPERATIONS_DATABASE_URL?.trim() ?? null;
}

function poolForFinancePeriodCheck(): pg.Pool | null {
  const url = financePeriodLockDatabaseUrl();
  if (!url) return null;
  if (!financePeriodPool) {
    financePeriodPool = new pg.Pool({ connectionString: url, max: 2 });
  }
  return financePeriodPool;
}

/** WI-OI-120fz (F1.4): refuse receipt complete when Finance fiscal period is locked for the posting date. */
export async function assertInventoryReceiptFinancePeriodOpen(
  tenantId: string,
  receivedAtIso: string,
): Promise<void> {
  const pool = poolForFinancePeriodCheck();
  if (!pool) return;

  const postingDate = inventoryReceiptPostingDate(receivedAtIso);
  const client = await pool.connect();
  try {
    const result = await resolvePrimaryBookPostingContext(client, FINANCE_SCHEMA, tenantId, postingDate);
    if (typeof result === 'string') {
      throw new DocumentGuardRefusedError('complete', financePostingContextRefusal(result, postingDate));
    }
  } finally {
    client.release();
  }
}
