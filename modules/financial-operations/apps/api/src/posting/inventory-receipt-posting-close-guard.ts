import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  loadFiscalPeriodDateRange,
  reconcileInventoryReceiptPosting,
  summarizeInventoryReceiptPostingInbox,
} from './inventory-receipt-posting-reconciliation.js';

/** ADR-0033 F2 / D3: period and inventory subledger close wait until receipt posting is reconciled. */
export async function assertInventoryReceiptPostingReadyForClose(
  client: PoolClient,
  schema: string,
  tenantId: string,
  fiscalPeriodId: string,
): Promise<void> {
  const periodRange = await loadFiscalPeriodDateRange(client, schema, tenantId, fiscalPeriodId);
  if (!periodRange) {
    throw new ConflictException({
      code: 'FINANCE_FISCAL_PERIOD_NOT_FOUND',
      message: `Fiscal period ${fiscalPeriodId} was not found for posting close checks.`,
    });
  }

  const reconciliation = await reconcileInventoryReceiptPosting(
    client,
    schema,
    tenantId,
    inventoryReceiptCompletedPostingPolicyV1.eventType,
    periodRange,
  );
  if (!reconciliation.balanced) {
    throw new ConflictException({
      code: 'FINANCE_INVENTORY_POSTING_NOT_BALANCED',
      message:
        'Period close is blocked until Inventory receipt posting is reconciled for this fiscal period (no failed inbox, stale processing, or missing journals in range).',
      reconciliation,
      fiscalPeriodId,
    });
  }

  const inboxInPeriod = await summarizeInventoryReceiptPostingInbox(
    client,
    schema,
    tenantId,
    inventoryReceiptCompletedPostingPolicyV1.eventType,
    periodRange,
  );
  const inventoryPostingTouchedPeriod = inboxInPeriod.processed > 0;
  if (!inventoryPostingTouchedPeriod) return;

  const cutoff = await client.query<{ undelivered_receipt_count: number }>(
    `SELECT undelivered_receipt_count FROM ${schema}.inventory_posting_cutoff_confirmations
      WHERE tenant_id = $1 AND fiscal_period_id = $2`,
    [tenantId, fiscalPeriodId],
  );
  const confirmed = cutoff.rows[0];
  if (!confirmed || confirmed.undelivered_receipt_count !== 0) {
    throw new ConflictException({
      code: 'FINANCE_INVENTORY_POSTING_CUTOFF_MISSING',
      message:
        'Period close is blocked until Inventory confirms zero undelivered receipt posting events for this fiscal period.',
      fiscalPeriodId,
      undeliveredReceiptCount: confirmed?.undelivered_receipt_count ?? null,
    });
  }
}
