import { randomUUID } from 'node:crypto';
import {
  financeFiscalPeriodSnapshotCompletedV1,
  financeFiscalPeriodStateChangedV1,
  financeInventoryReceiptPostingOutcomeV1,
  type FinanceInventoryReceiptPostingOutcomeStatus,
} from '@gigalibs/posting-rules';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { appendOutboxEvent } from '../outbox.js';

type FiscalPeriodRow = {
  id: string;
  accounting_book_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: string;
  is_primary: boolean;
  version: number;
};

async function loadFiscalPeriodRows(client: PoolClient, tenantId: string): Promise<FiscalPeriodRow[]> {
  const rows = await client.query<FiscalPeriodRow>(
    `SELECT p.id, p.accounting_book_id, p.period_name, p.start_date::text, p.end_date::text, p.status,
            b.is_primary, p.version::int AS version
       FROM ${SCHEMA}.fiscal_periods p
       JOIN ${SCHEMA}.accounting_books b
         ON b.tenant_id = p.tenant_id AND b.id = p.accounting_book_id
      WHERE p.tenant_id = $1
      ORDER BY p.start_date, p.id`,
    [tenantId],
  );
  return rows.rows;
}

/** One-time per-tenant snapshot so Inventory's fiscal replica can refuse locked periods before live relay events. */
export async function ensureInventoryFiscalPeriodSnapshotPublished(
  client: PoolClient,
  tenantId: string,
): Promise<void> {
  const existing = await client.query<{ tenant_id: string }>(
    `SELECT tenant_id FROM ${SCHEMA}.inventory_fiscal_replica_publish WHERE tenant_id = $1`,
    [tenantId],
  );
  if (existing.rowCount) return;

  const periodRows = await loadFiscalPeriodRows(client, tenantId);
  for (const row of periodRows) {
    await appendFiscalPeriodStateChanged(client, tenantId, row);
  }

  const primaryBookId = periodRows.find((row) => row.is_primary)?.accounting_book_id;
  if (primaryBookId) {
    await appendFiscalPeriodSnapshotCompleted(client, tenantId, primaryBookId, periodRows.length);
  }

  await client.query(
    `INSERT INTO ${SCHEMA}.inventory_fiscal_replica_publish (tenant_id) VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId],
  );
}

/** Proactive D1 snapshot for tenants with fiscal periods but no publish marker (startup + daily job). */
export async function publishPendingInventoryFiscalReplicaSnapshots(client: PoolClient, tenantId: string): Promise<boolean> {
  const pending = await client.query<{ tenant_id: string }>(
    `SELECT DISTINCT p.tenant_id
       FROM ${SCHEMA}.fiscal_periods p
       LEFT JOIN ${SCHEMA}.inventory_fiscal_replica_publish pub ON pub.tenant_id = p.tenant_id
      WHERE p.tenant_id = $1 AND pub.tenant_id IS NULL`,
    [tenantId],
  );
  if (!pending.rowCount) return false;
  await ensureInventoryFiscalPeriodSnapshotPublished(client, tenantId);
  return true;
}

export async function appendFiscalPeriodStateChanged(
  client: PoolClient,
  tenantId: string,
  period: {
    id: string;
    accounting_book_id: string;
    period_name: string;
    start_date: string;
    end_date: string;
    status: string;
    is_primary: boolean;
    version: number;
  },
): Promise<void> {
  const eventId = randomUUID();
  await appendOutboxEvent(client, tenantId, {
    id: eventId,
    type: financeFiscalPeriodStateChangedV1.eventType,
    aggregateType: financeFiscalPeriodStateChangedV1.aggregateType,
    aggregateId: period.id,
    correlationId: eventId,
    data: {
      fiscalPeriodId: period.id,
      accountingBookId: period.accounting_book_id,
      periodName: period.period_name,
      startDate: period.start_date,
      endDate: period.end_date,
      status: period.status,
      isPrimaryBook: period.is_primary,
      stateVersion: period.version,
    },
  });
}

export async function appendFiscalPeriodSnapshotCompleted(
  client: PoolClient,
  tenantId: string,
  primaryBookId: string,
  periodCount: number,
): Promise<void> {
  const eventId = randomUUID();
  await appendOutboxEvent(client, tenantId, {
    id: eventId,
    type: financeFiscalPeriodSnapshotCompletedV1.eventType,
    aggregateType: financeFiscalPeriodSnapshotCompletedV1.aggregateType,
    aggregateId: primaryBookId,
    correlationId: eventId,
    data: {
      primaryBookId,
      periodCount,
    },
  });
}

export async function appendInventoryReceiptPostingOutcome(
  client: PoolClient,
  tenantId: string,
  receiptId: string,
  status: FinanceInventoryReceiptPostingOutcomeStatus,
  rejectionCode: string | null,
): Promise<void> {
  const eventId = randomUUID();
  await appendOutboxEvent(client, tenantId, {
    id: eventId,
    type: financeInventoryReceiptPostingOutcomeV1.eventType,
    aggregateType: financeInventoryReceiptPostingOutcomeV1.aggregateType,
    aggregateId: receiptId,
    correlationId: eventId,
    data: {
      receiptId,
      status,
      rejectionCode: rejectionCode ?? undefined,
    },
  });
}
