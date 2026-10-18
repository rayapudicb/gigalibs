import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { reconcileInventoryReceiptPosting } from './inventory-receipt-posting-reconciliation.js';

/** ADR-0033 F2 / D3: period and inventory subledger close wait until receipt posting is reconciled. */
export async function assertInventoryReceiptPostingReadyForClose(
  client: PoolClient,
  schema: string,
  tenantId: string,
): Promise<void> {
  const reconciliation = await reconcileInventoryReceiptPosting(
    client,
    schema,
    tenantId,
    inventoryReceiptCompletedPostingPolicyV1.eventType,
  );
  if (reconciliation.balanced) return;

  throw new ConflictException({
    code: 'FINANCE_INVENTORY_POSTING_NOT_BALANCED',
    message:
      'Period close is blocked until Inventory receipt posting is reconciled (no failed inbox, stale processing, or missing journals).',
    reconciliation,
  });
}
