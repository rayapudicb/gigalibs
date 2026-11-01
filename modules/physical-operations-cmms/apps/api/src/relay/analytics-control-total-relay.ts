import { publishModuleAnalyticsControlTotal } from '@gigalibs/module-sdk';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import {
  ANALYTICS_INBOX_AUDIENCE,
  CMMS_ANALYTICS_RELAY_CONFIG,
  type CmmsAnalyticsRelayConfig,
} from './relay-config.js';

const DEFAULT_INTERVAL_MS = 600_000;

/** WI-OI-131 B7: reports closed-downtime control totals to Analytics for count reconciliation. */
@Injectable()
export class CmmsAnalyticsControlTotalRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CmmsAnalyticsControlTotalRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    @Inject(CMMS_ANALYTICS_RELAY_CONFIG) private readonly config: CmmsAnalyticsRelayConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.outbound) return;
    const intervalMs = Number.parseInt(process.env.CMMS_ANALYTICS_CONTROL_TOTAL_INTERVAL_MS ?? '', 10);
    const ms = Number.isFinite(intervalMs) && intervalMs >= 60_000 ? intervalMs : DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => void this.tick(), ms);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (!this.config.outbound || this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const tenants = await this.database.relayCall<{
        tenant_id: string;
        record_count: string;
        pending_outbox: string;
      }>('analytics_report_downtime_control_totals', []);
      const reportedAt = new Date().toISOString();
      for (const row of tenants) {
        const backfillComplete = Number(row.pending_outbox) === 0;
        const outcome = await publishModuleAnalyticsControlTotal(this.config, {
          tenantId: row.tenant_id,
          source: 'cmms',
          audience: ANALYTICS_INBOX_AUDIENCE,
          controlTotal: {
            catalogModuleKey: 'asset-maintenance',
            sourceKey: 'cmms-downtime',
            producerRecordCount: Number(row.record_count),
            reportedAt,
            backfillComplete,
            backfillCursor: backfillComplete ? null : 'downtime-ended-v1',
            backfillBatchSeq: 1,
          },
        });
        if (outcome.ok) sent += 1;
        else this.logger.warn(`Analytics control total for ${row.tenant_id} failed: ${outcome.code ?? 'unknown'}`);
      }
    } catch (error) {
      this.logger.error(
        'CMMS analytics control-total pass failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
    return sent;
  }

}
