import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import type { DatabaseService } from '../database.service.js';
import {
  reconcileInventoryReceiptPosting,
  type InventoryReceiptPostingReconciliationV1,
} from './inventory-receipt-posting-reconciliation.js';

const CONSUMER = 'finance.inventory-subledger';
const SYSTEM_ACTOR = 'system:inventory-receipt-posting-reconciliation';
const DEFAULT_INTERVAL_MS = 86_400_000;
const MIN_INTERVAL_MS = 60_000;

export type InventoryReceiptPostingReconciliationJobConfig = {
  readonly enabled: boolean;
  readonly intervalMs: number;
};

export function loadInventoryReceiptPostingReconciliationJobConfig(
  environment: NodeJS.ProcessEnv = process.env,
): InventoryReceiptPostingReconciliationJobConfig {
  const disabled = (environment.FINANCE_INVENTORY_POSTING_RECONCILIATION_DISABLED ?? '').trim().toLowerCase();
  if (disabled === '1' || disabled === 'true' || disabled === 'yes') {
    return { enabled: false, intervalMs: DEFAULT_INTERVAL_MS };
  }
  const raw = environment.FINANCE_INVENTORY_POSTING_RECONCILIATION_INTERVAL_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_INTERVAL_MS;
  const intervalMs =
    Number.isFinite(parsed) && parsed >= MIN_INTERVAL_MS ? parsed : DEFAULT_INTERVAL_MS;
  return { enabled: true, intervalMs };
}

export type InventoryReceiptPostingReconciliationSweepResult = {
  readonly tenantsChecked: number;
  readonly unbalancedTenants: number;
};

/** ADR-0033 D3: compare inbox and journals per tenant; audit when gaps remain. */
export async function runInventoryReceiptPostingReconciliationSweep(
  database: Pick<DatabaseService, 'relayCall' | 'withTenantTransaction'>,
  config: InventoryReceiptPostingReconciliationJobConfig = loadInventoryReceiptPostingReconciliationJobConfig(),
): Promise<InventoryReceiptPostingReconciliationSweepResult> {
  if (!config.enabled) return { tenantsChecked: 0, unbalancedTenants: 0 };

  const eventType = inventoryReceiptCompletedPostingPolicyV1.eventType;
  const rows = await database.relayCall<{ tenant_id: string }>(
    'list_inventory_receipt_posting_reconciliation_tenants',
    [CONSUMER, eventType],
  );
  let unbalancedTenants = 0;
  for (const row of rows) {
    const tenantId = row.tenant_id;
    if (!tenantId) continue;
    const reconciliation = await database.withTenantTransaction(tenantId, (client) =>
      reconcileInventoryReceiptPosting(client, SCHEMA, tenantId, eventType),
    );
    if (!reconciliation.balanced) {
      unbalancedTenants += 1;
      await database.withTenantTransaction(tenantId, (client) =>
        recordReconciliationGapAudit(client, tenantId, reconciliation),
      );
    }
  }
  return { tenantsChecked: rows.length, unbalancedTenants };
}

async function recordReconciliationGapAudit(
  client: PoolClient,
  tenantId: string,
  reconciliation: InventoryReceiptPostingReconciliationV1,
): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.audit_events (tenant_id, entity_type, entity_id, action, actor_id, payload)
     VALUES ($1, 'INVENTORY_RECEIPT_POSTING', 'daily', 'RECONCILIATION_GAP', $2, $3::jsonb)`,
    [
      tenantId,
      SYSTEM_ACTOR,
      JSON.stringify({
        balanced: reconciliation.balanced,
        processed: reconciliation.processed,
        failed: reconciliation.failed,
        processingStale: reconciliation.processingStale,
        missingJournalSourceIds: reconciliation.missingJournalSourceIds,
      }),
    ],
  );
}

/** Schedules {@link runInventoryReceiptPostingReconciliationSweep} on a fixed interval. */
export class InventoryReceiptPostingReconciliationJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(InventoryReceiptPostingReconciliationJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly jobConfig: InventoryReceiptPostingReconciliationJobConfig = loadInventoryReceiptPostingReconciliationJobConfig(),
  ) {}

  onApplicationBootstrap(): void {
    if (!this.jobConfig.enabled) {
      this.logger.log('Inventory receipt posting reconciliation job is disabled.');
      return;
    }
    this.logger.log(`Inventory receipt posting reconciliation every ${this.jobConfig.intervalMs} ms.`);
    this.timer = setInterval(() => void this.tick(), this.jobConfig.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<InventoryReceiptPostingReconciliationSweepResult> {
    if (this.running) return { tenantsChecked: 0, unbalancedTenants: 0 };
    this.running = true;
    try {
      const result = await runInventoryReceiptPostingReconciliationSweep(this.database, this.jobConfig);
      if (result.unbalancedTenants > 0) {
        this.logger.warn(
          `Inventory receipt posting gaps on ${result.unbalancedTenants}/${result.tenantsChecked} tenant(s).`,
        );
      }
      return result;
    } catch (error) {
      this.logger.error('Inventory receipt posting reconciliation sweep failed.', error);
      return { tenantsChecked: 0, unbalancedTenants: 0 };
    } finally {
      this.running = false;
    }
  }
}
