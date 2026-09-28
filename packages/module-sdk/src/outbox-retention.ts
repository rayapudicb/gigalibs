import { Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import type pg from 'pg';

/** Retention windows for delivery buffers (production hardening); audit evidence is never swept. */
export interface OutboxRetentionConfig {
  readonly retentionDays: number;
  readonly receiptRetentionDays: number;
  readonly intervalMs: number;
}

const BATCH = 10_000;
const MAX_BATCHES_PER_SWEEP = 20;

/**
 * Reads `<PREFIX>_OUTBOX_RETENTION_DAYS` (default 30), `<PREFIX>_INBOX_RECEIPT_RETENTION_DAYS` (default 90, never
 * shorter than the outbox window) and `<PREFIX>_OUTBOX_SWEEP_INTERVAL_MS` (default hourly).
 */
export function loadOutboxRetentionConfig(
  environment: NodeJS.ProcessEnv,
  prefix: string,
): OutboxRetentionConfig {
  const outbox = `${prefix}_OUTBOX_RETENTION_DAYS`;
  const receipts = `${prefix}_INBOX_RECEIPT_RETENTION_DAYS`;
  const interval = `${prefix}_OUTBOX_SWEEP_INTERVAL_MS`;
  const retentionDays = bounded(environment[outbox], outbox, 30, 7, 3650);
  const receiptRetentionDays = bounded(environment[receipts], receipts, 90, 7, 3650);
  if (receiptRetentionDays < retentionDays) {
    throw new Error(
      `${receipts} must be at least ${outbox}, so replays inside the window stay de-duplicated.`,
    );
  }
  return Object.freeze({
    retentionDays,
    receiptRetentionDays,
    intervalMs: bounded(environment[interval], interval, 3_600_000, 60_000, 86_400_000),
  });
}

/** The part of the module database retention needs: the `outbox_sweep` definer function. */
export interface RetentionDatabase {
  relayCall<T extends pg.QueryResultRow>(
    fn: 'outbox_sweep',
    values: readonly unknown[],
  ): Promise<T[]>;
}

/**
 * Bounds outbox and inbox growth: delivered facts, facts no consumer is routed for, and old receipts are deleted
 * after the retention window by the `outbox_sweep` definer function. Dead letters, routed facts still pending and
 * audit evidence are kept.
 */
export class OutboxRetentionSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  protected readonly logger = new Logger(this.constructor.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly retentionDatabase: RetentionDatabase,
    private readonly retentionConfig: OutboxRetentionConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.first = setTimeout(() => void this.sweep(), 60_000);
    this.first.unref();
    this.timer = setInterval(() => void this.sweep(), this.retentionConfig.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  /** One sweep in bounded batches; returns what was deleted. */
  async sweep(): Promise<{ published: number; unrouted: number; receipts: number }> {
    const total = { published: 0, unrouted: 0, receipts: 0 };
    if (this.running) return total;
    this.running = true;
    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
        const [row] = await this.retentionDatabase.relayCall<{
          published: string;
          unrouted: string;
          receipts: string;
        }>('outbox_sweep', [
          this.retentionConfig.retentionDays,
          this.retentionConfig.receiptRetentionDays,
          BATCH,
        ]);
        const published = Number(row?.published ?? 0);
        const unrouted = Number(row?.unrouted ?? 0);
        const receipts = Number(row?.receipts ?? 0);
        total.published += published;
        total.unrouted += unrouted;
        total.receipts += receipts;
        if (published < BATCH && unrouted < BATCH && receipts < BATCH) break;
      }
      if (total.published || total.unrouted || total.receipts) {
        this.logger.log(
          `Outbox retention removed ${total.published} delivered and ${total.unrouted} unrouted facts and ${total.receipts} receipts older than the retention window.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'The outbox retention sweep failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
    return total;
  }
}

function bounded(
  raw: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = raw?.trim() ? Number(raw.trim()) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}
