import { prisma } from '@gigalibs/db';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

/**
 * WI-OI-120bd: sessions past their expiry are marked EXPIRED. The sign-in guard and refresh already refuse them, so this
 * changes nothing for anyone; it keeps "active sessions" true for every count and check (UAT held 243 such rows on
 * 2026-10-16). Bounded batches, one audit summary per run that changed anything.
 */
export function sessionSweepPolicy() {
  return Object.freeze({
    intervalSeconds: optionalPositiveInteger('SESSION_SWEEP_INTERVAL_SECONDS', 900),
    batchSize: optionalPositiveInteger('SESSION_SWEEP_BATCH_SIZE', 500),
    maxBatchesPerRun: optionalPositiveInteger('SESSION_SWEEP_MAX_BATCHES', 20),
  });
}

@Injectable()
export class SessionSweepWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SessionSweepWorker.name);
  private readonly policy = sessionSweepPolicy();
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), this.policy.intervalSeconds * 1_000);
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  /** One sweep; answers how many sessions it marked EXPIRED. */
  async tick(now = new Date()): Promise<number> {
    if (this.running || this.stopping) return 0;
    this.running = true;
    let expired = 0;
    try {
      for (let batch = 0; batch < this.policy.maxBatchesPerRun && !this.stopping; batch += 1) {
        const due = await prisma.session.findMany({
          where: { status: 'ACTIVE', expiresAt: { lt: now } },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: this.policy.batchSize,
        });
        if (due.length === 0) break;
        // The status and expiry are checked again, so a session refreshed or revoked meanwhile is left alone.
        const changed = await prisma.session.updateMany({
          where: {
            id: { in: due.map((session) => session.id) },
            status: 'ACTIVE',
            expiresAt: { lt: now },
          },
          data: { status: 'EXPIRED' },
        });
        expired += changed.count;
        if (due.length < this.policy.batchSize) break;
      }
      if (expired > 0) {
        await prisma.auditLog.create({
          data: {
            action: 'STATUS_CHANGE',
            resource: 'session',
            metadata: {
              event: 'EXPIRED_SESSIONS_SWEPT',
              count: expired,
              expiredBefore: now.toISOString(),
            },
          },
        });
        this.logger.log(`Marked ${expired} expired session(s) EXPIRED.`);
      }
    } catch (error) {
      this.logger.error(
        'The expired-session sweep failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
    return expired;
  }
}

function optionalPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
