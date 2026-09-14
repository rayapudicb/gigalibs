import { Prisma, prisma } from '@gigalibs/db';
import {
  createTenantExportArchive,
  createTenantExportBundle,
  verifyTenantExportArchive,
} from '@gigalibs/privacy-gdpr';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ObjectStorageService } from './object-storage.service.js';
import {
  getTenantExportSigningConfig,
  tenantExportPolicy,
  type TenantExportSigningConfig,
} from './tenant-export-config.js';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { TenantExportSnapshotService } from './tenant-export-snapshot.service.js';

interface ClaimedTenantExport {
  id: string;
  tenantId: string;
  requestedById: string;
  attempts: number;
  snapshotStartedAt: Date;
}

@Injectable()
export class TenantDataExportWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TenantDataExportWorker.name);
  private readonly policy = tenantExportPolicy();
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopping = false;
  private signing: TenantExportSigningConfig | undefined;

  constructor(
    private readonly snapshots: TenantExportSnapshotService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  onApplicationBootstrap() {
    this.signing = getTenantExportSigningConfig();
    if (!this.signing) {
      this.logger.warn('Tenant data-export worker is disabled because signing is not configured.');
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.policy.pollIntervalSeconds * 1_000);
    this.timer.unref();
    void this.tick();
  }

  async onApplicationShutdown() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  async tick() {
    if (this.running || this.stopping || !this.signing) return;
    this.running = true;
    try {
      await this.expireArchives();
      const claimed = await this.claimBatch();
      await Promise.allSettled(claimed.map((job) => this.process(job, this.signing!)));
    } catch (error) {
      this.logger.error(
        'Tenant data-export polling failed.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }

  private claimBatch() {
    const staleBefore = new Date(Date.now() - this.policy.claimTimeoutSeconds * 1_000);
    return prisma.$queryRaw<ClaimedTenantExport[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "tenant_data_exports"
        WHERE
          ("status" = 'REQUESTED' AND "availableAt" <= NOW())
          OR ("status" = 'RUNNING' AND "claimedAt" < ${staleBefore})
        ORDER BY "availableAt" ASC, "createdAt" ASC
        LIMIT ${this.policy.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "tenant_data_exports" AS export
      SET
        "status" = 'RUNNING',
        "attempts" = export."attempts" + 1,
        "claimedAt" = NOW(),
        "snapshotStartedAt" = NOW(),
        "updatedAt" = NOW()
      FROM candidates
      WHERE export."id" = candidates."id"
      RETURNING
        export."id",
        export."tenantId",
        export."requestedById",
        export."attempts",
        export."snapshotStartedAt"
    `);
  }

  private async process(job: ClaimedTenantExport, signing: TenantExportSigningConfig) {
    const storageKey = `tenant-exports/${job.tenantId}/${job.id}.zip`;
    try {
      const snapshot = await this.snapshots.load(job.tenantId);
      const bundle = createTenantExportBundle({
        exportId: job.id,
        tenantId: job.tenantId,
        generatedAt: job.snapshotStartedAt,
        keyId: signing.keyId,
        privateKey: signing.privateKey,
        sections: snapshot.sections,
      });
      const archive = createTenantExportArchive(bundle);
      if (!verifyTenantExportArchive(archive.bytes, signing.publicKey)) {
        throw new Error('TENANT_EXPORT_SELF_VERIFICATION_FAILED');
      }
      await this.objectStorage.writeVerifiedObject({
        storageKey,
        contentType: 'application/zip',
        bytes: archive.bytes,
        checksumSha256: archive.sha256,
      });
      const completedAt = new Date();
      const expiresAt = new Date(completedAt.getTime() + this.policy.expiryHours * 3_600_000);
      await prisma.$transaction(async (transaction) => {
        const updated = await transaction.tenantDataExport.updateMany({
          where: { id: job.id, tenantId: job.tenantId, status: 'RUNNING' },
          data: {
            status: 'SUCCEEDED',
            claimedAt: null,
            completedAt,
            expiresAt,
            storageKey,
            archiveSha256: archive.sha256,
            archiveBytes: archive.byteSize,
            manifest: bundle.manifest as unknown as Prisma.InputJsonValue,
            manifestSha256: bundle.signature.manifestSha256,
            signatureAlgorithm: bundle.signature.algorithm,
            signatureKeyId: bundle.signature.keyId,
            signaturePublicKey: signing.publicKeyBase64,
            signatureValue: bundle.signature.value,
            totalRecords: bundle.manifest.totalRecords,
          },
        });
        if (updated.count !== 1) throw new Error('TENANT_EXPORT_CLAIM_LOST');
        await transaction.auditLog.create({
          data: {
            tenantId: job.tenantId,
            userId: job.requestedById,
            action: 'EXPORT',
            resource: 'tenant-data-export',
            resourceId: job.id,
            after: {
              status: 'SUCCEEDED',
              archiveSha256: archive.sha256,
              totalRecords: bundle.manifest.totalRecords,
              expiresAt: expiresAt.toISOString(),
            },
          },
        });
      });
    } catch (error) {
      await this.recordFailure(job, storageKey, errorCode(error));
    }
  }

  private async recordFailure(job: ClaimedTenantExport, storageKey: string, code: string) {
    const terminal = job.attempts >= this.policy.maxAttempts || isPermanentFailure(code);
    if (terminal) await this.objectStorage.deleteObject(storageKey).catch(() => undefined);
    const exponent = Math.max(0, job.attempts - 1);
    const retrySeconds = Math.min(
      this.policy.retryMaxSeconds,
      this.policy.retryBaseSeconds * 2 ** exponent,
    );
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.tenantDataExport.updateMany({
        where: { id: job.id, tenantId: job.tenantId, status: 'RUNNING' },
        data: terminal
          ? {
              status: 'FAILED',
              claimedAt: null,
              completedAt: new Date(),
              failureCode: code,
              failureMessage: 'Tenant export generation failed. Use the failure code for support.',
            }
          : {
              status: 'REQUESTED',
              claimedAt: null,
              snapshotStartedAt: null,
              availableAt: new Date(Date.now() + retrySeconds * 1_000),
            },
      });
      if (updated.count !== 1) return;
      if (terminal) {
        await transaction.auditLog.create({
          data: {
            tenantId: job.tenantId,
            userId: job.requestedById,
            action: 'EXPORT',
            resource: 'tenant-data-export',
            resourceId: job.id,
            after: { status: 'FAILED', failureCode: code, attempts: job.attempts },
          },
        });
      }
    });
    this.logger.warn(
      `Tenant data export ${terminal ? 'failed' : 'scheduled for retry'}. exportId=${job.id} code=${code} attempts=${job.attempts}`,
    );
  }

  private async expireArchives() {
    const expired = await prisma.tenantDataExport.findMany({
      where: { status: 'SUCCEEDED', expiresAt: { lte: new Date() } },
      orderBy: { expiresAt: 'asc' },
      take: this.policy.batchSize,
      select: { id: true, tenantId: true, storageKey: true, requestedById: true },
    });
    for (const row of expired) {
      if (!row.storageKey) continue;
      try {
        await this.objectStorage.deleteObject(row.storageKey);
        await prisma.$transaction(async (transaction) => {
          const updated = await transaction.tenantDataExport.updateMany({
            where: { id: row.id, tenantId: row.tenantId, status: 'SUCCEEDED' },
            data: { status: 'EXPIRED', archiveDeletedAt: new Date() },
          });
          if (updated.count === 1) {
            await transaction.auditLog.create({
              data: {
                tenantId: row.tenantId,
                userId: row.requestedById,
                action: 'EXPORT',
                resource: 'tenant-data-export',
                resourceId: row.id,
                after: { status: 'EXPIRED', archiveDeleted: true },
              },
            });
          }
        });
      } catch (error) {
        this.logger.warn(
          `Tenant export expiry cleanup failed. exportId=${row.id} code=${errorCode(error)}`,
        );
      }
    }
  }
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (/^[A-Z][A-Z0-9_]{2,100}$/.test(code)) return code;
  }
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{2,100}$/.test(error.message)) {
    return error.message;
  }
  return 'TENANT_EXPORT_GENERATION_ERROR';
}

function isPermanentFailure(code: string): boolean {
  return [
    'TENANT_EXPORT_TENANT_NOT_FOUND',
    'TENANT_EXPORT_SELF_VERIFICATION_FAILED',
    'FILE_SIZE_LIMIT_EXCEEDED',
  ].includes(code);
}
