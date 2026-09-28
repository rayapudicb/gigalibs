import { prisma } from '@gigalibs/db';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

@Injectable()
export class OutboxRelayProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayProcessor.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  async tick() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const pending = await prisma.platformOutboxEvent.findMany({
        where: {
          status: 'PENDING',
          availableAt: { lte: new Date() },
        },
        take: 20,
        orderBy: { createdAt: 'asc' },
      });

      for (const event of pending) {
        try {
          await prisma.platformOutboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              updatedAt: new Date(),
            },
          });
        } catch (error) {
          const attempts = event.attempts + 1;
          const status = attempts >= 5 ? 'QUARANTINED' : 'PENDING';
          const backoffSeconds = Math.min(300, 2 ** attempts);
          const availableAt = new Date(Date.now() + backoffSeconds * 1_000);
          await prisma.platformOutboxEvent.update({
            where: { id: event.id },
            data: {
              attempts,
              status,
              availableAt,
              lastError: error instanceof Error ? error.message : String(error),
              updatedAt: new Date(),
            },
          });
          if (status === 'QUARANTINED') {
            this.logger.error(`Outbox event ${event.id} quarantined after ${attempts} failed attempts.`);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Outbox relay tick failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
