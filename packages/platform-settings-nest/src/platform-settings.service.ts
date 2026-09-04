import { prisma, type Prisma } from '@gigalibs/db';
import {
  PlatformSettingsEngine,
  TenantPlatformSettingsSchema,
  type TenantPlatformSettings,
  type TenantPlatformSettingsPatch,
} from '@gigalibs/platform-settings';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class PlatformSettingsService {
  async getForTenant(tenantId: string): Promise<TenantPlatformSettings> {
    const row = await prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!row) throw new NotFoundException(`Settings for tenant '${tenantId}' were not found.`);
    return this.fromRow(row);
  }

  async updateForTenant(
    tenantId: string,
    userId: string,
    patch: TenantPlatformSettingsPatch,
  ): Promise<TenantPlatformSettings> {
    const current = await this.getForTenant(tenantId);
    if (current.version !== patch.expectedVersion) {
      throw new ConflictException({
        code: 'SETTINGS_VERSION_CONFLICT',
        message: 'Settings changed since they were loaded. Reload and try again.',
        expectedVersion: patch.expectedVersion,
        currentVersion: current.version,
      });
    }

    const next = PlatformSettingsEngine.applyPatch(current, patch);
    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.tenantSettings.updateMany({
        where: { tenantId, version: patch.expectedVersion },
        data: {
          version: next.version,
          branding: next.branding as Prisma.InputJsonValue,
          security: next.security as Prisma.InputJsonValue,
          localization: next.localization as Prisma.InputJsonValue,
          features: next.features as Prisma.InputJsonValue,
          metadata: next.metadata as Prisma.InputJsonValue,
          updatedById: userId,
        },
      });

      if (result.count !== 1) {
        throw new ConflictException({
          code: 'SETTINGS_VERSION_CONFLICT',
          message: 'Settings changed while the update was being committed.',
        });
      }

      const updatedRow = await transaction.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
      await transaction.auditLog.create({
        data: {
          action: 'SETTINGS_CHANGE',
          resource: 'tenant-settings',
          resourceId: updatedRow.id,
          userId,
          tenantId,
          before: current as Prisma.InputJsonValue,
          after: next as Prisma.InputJsonValue,
        },
      });

      return updatedRow;
    });

    return this.fromRow(updated);
  }

  private fromRow(row: {
    tenantId: string;
    version: number;
    branding: unknown;
    security: unknown;
    localization: unknown;
    features: unknown;
    metadata: unknown;
  }): TenantPlatformSettings {
    return TenantPlatformSettingsSchema.parse(row);
  }
}
