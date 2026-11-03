import { inventoryReceiptCompletedPostingPolicyV1 } from '@gigalibs/posting-rules';
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import {
  reconcileInventoryReceiptPosting,
  type InventoryReceiptPostingReconciliationV1,
} from './inventory-receipt-posting-reconciliation.js';
import { runInventoryFiscalReplicaSnapshotSweep } from '../subledger/inventory-fiscal-replica-snapshot-sweep.js';

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
const RECONCILIATION_ADVISORY_LOCK_KEY = 'gigalibs_finance:inventory_receipt_posting_reconciliation';

export async function runInventoryReceiptPostingReconciliationSweep(
  database: Pick<DatabaseService, 'relayCall' | 'withTenantTransaction' | 'getPool'>,
  config: InventoryReceiptPostingReconciliationJobConfig = loadInventoryReceiptPostingReconciliationJobConfig(),
): Promise<InventoryReceiptPostingReconciliationSweepResult> {
  if (!config.enabled) return { tenantsChecked: 0, unbalancedTenants: 0 };

  const lockClient = await database.getPool().connect();
  let locked = false;
  try {
    const row = await lockClient.query<{ locked: boolean }>(`SELECT pg_try_advisory_lock(hashtext($1)) AS locked`, [
      RECONCILIATION_ADVISORY_LOCK_KEY,
    ]);
    locked = row.rows[0]?.locked === true;
  } finally {
    if (!locked) lockClient.release();
  }
  if (!locked) return { tenantsChecked: 0, unbalancedTenants: 0 };

  try {
  await runInventoryFiscalReplicaSnapshotSweep(database);
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
  } finally {
    await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [RECONCILIATION_ADVISORY_LOCK_KEY]);
    lockClient.release();
  }
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

export const INVENTORY_RECEIPT_POSTING_RECONCILIATION_CONFIG = Symbol('INVENTORY_RECEIPT_POSTING_RECONCILIATION_CONFIG');

/**
 * Schedules {@link runInventoryReceiptPostingReconciliationSweep} on a fixed interval. WI-OI-146 (QA-033): injectable
 * with an explicit DatabaseService token; without them Nest built the job with no database and every sweep failed with
 * "Cannot read properties of undefined (reading 'getPool')".
 */
@Injectable()
export class InventoryReceiptPostingReconciliationJob
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(InventoryReceiptPostingReconciliationJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  private readonly jobConfig: InventoryReceiptPostingReconciliationJobConfig;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(INVENTORY_RECEIPT_POSTING_RECONCILIATION_CONFIG)
    jobConfig?: InventoryReceiptPostingReconciliationJobConfig,
  ) {
    this.jobConfig = jobConfig ?? loadInventoryReceiptPostingReconciliationJobConfig();
  }

  onApplicationBootstrap(): void {
    if (!this.jobConfig.enabled) {
      this.logger.log('Inventory receipt posting reconciliation job is disabled.');
      return;
    }
    this.logger.log(`Inventory receipt posting reconciliation every ${this.jobConfig.intervalMs} ms.`);
    void this.tick();
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
