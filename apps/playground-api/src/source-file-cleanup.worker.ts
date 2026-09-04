import { prisma } from '@gigalibs/db';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ObjectStorageService } from './object-storage.service.js';

@Injectable()
export class SourceFileCleanupWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SourceFileCleanupWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;

  constructor(private readonly objectStorage: ObjectStorageService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(
      () => void this.tick(),
      runtimeConfig.storageCleanupIntervalSeconds * 1_000,
    );
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
      const now = new Date();
      const files = await prisma.sourceFileImport.findMany({
        where: {
          storageDeletedAt: null,
          OR: [
            { status: { in: ['PROFILED', 'INGESTED', 'FAILED', 'EXPIRED'] } },
            { status: 'UPLOAD_PENDING', uploadExpiresAt: { lt: now } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: runtimeConfig.storageCleanupBatchSize,
        select: { id: true, storageKey: true, status: true },
      });
      for (const file of files) {
        try {
          await this.objectStorage.deleteObject(file.storageKey);
          await prisma.sourceFileImport.update({
            where: { id: file.id },
            data: {
              storageDeletedAt: new Date(),
              ...(file.status === 'UPLOAD_PENDING'
                ? { status: 'EXPIRED' as const, failureCode: 'UPLOAD_EXPIRED' }
                : {}),
            },
          });
        } catch (error) {
          this.logger.warn(
            `Temporary source-file cleanup failed. fileId=${file.id} error=${
              error instanceof Error ? error.name : 'unknown'
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Temporary source-file cleanup scan failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
