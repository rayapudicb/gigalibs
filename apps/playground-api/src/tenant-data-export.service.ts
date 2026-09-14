import { Prisma, prisma } from '@gigalibs/db';
import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { ObjectStorageService } from './object-storage.service.js';
import { requireTenantExportSigningConfig } from './tenant-export-config.js';

const EXPORT_PUBLIC_FIELDS = {
  id: true,
  status: true,
  formatVersion: true,
  requestReason: true,
  attempts: true,
  snapshotStartedAt: true,
  completedAt: true,
  expiresAt: true,
  archiveDeletedAt: true,
  archiveSha256: true,
  archiveBytes: true,
  manifest: true,
  manifestSha256: true,
  signatureAlgorithm: true,
  signatureKeyId: true,
  signaturePublicKey: true,
  signatureValue: true,
  totalRecords: true,
  failureCode: true,
  failureMessage: true,
  requestedById: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class TenantDataExportService {
  constructor(private readonly objectStorage: ObjectStorageService) {}

  async request(tenantId: string, userId: string, reason: string) {
    requireTenantExportSigningConfig();
    try {
      return await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId} FOR UPDATE`;
        const membership = await transaction.tenantMember.findUnique({
          where: { userId_tenantId: { userId, tenantId } },
          select: { status: true, user: { select: { status: true } } },
        });
        if (membership?.status !== 'ACTIVE' || membership.user.status !== 'ACTIVE') {
          throw new NotFoundException('Active tenant membership was not found.');
        }
        const active = await transaction.tenantDataExport.findFirst({
          where: { tenantId, status: { in: ['REQUESTED', 'RUNNING'] } },
          select: { id: true, status: true },
        });
        if (active) {
          throw new ConflictException({
            code: 'TENANT_EXPORT_ALREADY_ACTIVE',
            message: 'A tenant data export is already in progress.',
            exportId: active.id,
            status: active.status,
          });
        }
        const created = await transaction.tenantDataExport.create({
          data: { tenantId, requestedById: userId, requestReason: reason },
          select: EXPORT_PUBLIC_FIELDS,
        });
        await transaction.auditLog.create({
          data: {
            tenantId,
            userId,
            action: 'EXPORT',
            resource: 'tenant-data-export',
            resourceId: created.id,
            after: { status: 'REQUESTED', reason },
          },
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'TENANT_EXPORT_ALREADY_ACTIVE',
          message: 'A tenant data export is already in progress.',
        });
      }
      throw error;
    }
  }

  list(tenantId: string) {
    return prisma.tenantDataExport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: EXPORT_PUBLIC_FIELDS,
    });
  }

  async createDownload(tenantId: string, userId: string, exportId: string) {
    const row = await prisma.tenantDataExport.findFirst({
      where: { id: exportId, tenantId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        archiveDeletedAt: true,
        storageKey: true,
        archiveSha256: true,
        archiveBytes: true,
      },
    });
    if (!row) throw new NotFoundException('Tenant data export was not found.');
    if (
      row.status === 'EXPIRED' ||
      row.archiveDeletedAt ||
      (row.expiresAt && row.expiresAt.getTime() <= Date.now())
    ) {
      throw new GoneException({
        code: 'TENANT_EXPORT_EXPIRED',
        message: 'The tenant data export has expired and is no longer downloadable.',
      });
    }
    if (
      row.status !== 'SUCCEEDED' ||
      !row.storageKey ||
      !row.expiresAt ||
      !row.archiveSha256 ||
      !row.archiveBytes
    ) {
      throw new ConflictException({
        code: 'TENANT_EXPORT_NOT_READY',
        message: 'The tenant data export is not ready for download.',
        status: row.status,
      });
    }
    const secondsRemaining = Math.floor((row.expiresAt.getTime() - Date.now()) / 1_000);
    if (secondsRemaining < 1) throw new GoneException('The tenant data export has expired.');
    const signed = await this.objectStorage.createDownloadUrl({
      storageKey: row.storageKey,
      filename: `gigalibs-tenant-export-${row.id}.zip`,
      expiresInSeconds: secondsRemaining,
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'EXPORT',
        resource: 'tenant-data-export-download',
        resourceId: row.id,
        after: { archiveSha256: row.archiveSha256, urlExpiresAt: signed.expiresAt.toISOString() },
      },
    });
    return {
      ...signed,
      archiveSha256: row.archiveSha256,
      archiveBytes: row.archiveBytes,
    };
  }
}
