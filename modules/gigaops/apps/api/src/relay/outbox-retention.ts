import {
  type OutboxRetentionConfig,
  OutboxRetentionSweeper,
  loadOutboxRetentionConfig as loadRetention,
} from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { WorkforceDatabaseService } from '../database/database.service.js';

export type { OutboxRetentionConfig } from '@gigalibs/module-sdk';

export const OUTBOX_RETENTION_CONFIG = Symbol('OUTBOX_RETENTION_CONFIG');

/** WORKFORCE_OUTBOX_RETENTION_DAYS, WORKFORCE_INBOX_RECEIPT_RETENTION_DAYS and WORKFORCE_OUTBOX_SWEEP_INTERVAL_MS. */
export function loadOutboxRetentionConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OutboxRetentionConfig {
  return loadRetention(environment, 'WORKFORCE');
}

/**
 * Bounds Workforce outbox and inbox growth (production hardening) on the module SDK (WI-OI-082): delivered facts,
 * facts no consumer is routed for, and old receipts are deleted after the retention window by `outbox_sweep`.
 * Dead letters, routed facts still pending and audit evidence are kept.
 */
@Injectable()
export class OutboxRetention extends OutboxRetentionSweeper {
  constructor(
    database: WorkforceDatabaseService,
    @Inject(OUTBOX_RETENTION_CONFIG) config: OutboxRetentionConfig,
  ) {
    super(database, config);
  }
}
