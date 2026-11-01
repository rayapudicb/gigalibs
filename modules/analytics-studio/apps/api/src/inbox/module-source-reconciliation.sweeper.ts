import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ModuleSourceReconciliationService } from './module-source-reconciliation.service.js';

const DEFAULT_INTERVAL_MS = 600_000;

/** Recomputes stored reconciliation rows for tenants that have reported control totals. */
@Injectable()
export class ModuleSourceReconciliationSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ModuleSourceReconciliationSweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly reconciliation: ModuleSourceReconciliationService,
  ) {}

  onApplicationBootstrap(): void {
    const enabled = (process.env.ANALYTICS_MODULE_RECONCILE_SWEEPER ?? '1').trim() !== '0';
    if (!enabled) return;
    const intervalMs = Number.parseInt(process.env.ANALYTICS_MODULE_RECONCILE_INTERVAL_MS ?? '', 10);
    const ms = Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.tick(), ms);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let checked = 0;
    try {
      const pairs = await this.db.query<{ tenant_id: string; source_key: string }>(
        `SELECT tenant_id, source_key FROM gigalibs_analytics.module_source_control_totals`,
      );
      for (const row of pairs.rows) {
        await this.reconciliation.reconcileTenantSource(row.tenant_id, row.source_key);
        checked += 1;
      }
    } catch (error) {
      this.logger.error(
        'Module source reconciliation sweep failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
    return checked;
  }
}
