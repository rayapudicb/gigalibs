import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  tenantModuleEntitlement: { findUnique: vi.fn() },
  configurationActivation: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock('@gigalibs/db', () => ({ prisma: database, Prisma: { JsonNull: null } }));

import { ConfigurationManifestCache } from './configuration-manifest.cache.js';
import { ConfigurationRuntimeMetrics } from './configuration-runtime.metrics.js';
import { ConfigurationStudioService } from './configuration-studio.service.js';

const manifest = {
  contractVersion: '1.0' as const,
  moduleKey: 'tenant-settings',
  entityKey: 'tenant-profile',
  surfaceKey: 'profile-extension',
  mode: 'EDIT' as const,
  title: 'Tenant profile',
  fields: [],
  sections: [],
  compilerVersion: '1.0.0',
  checksum: `sha256:${'a'.repeat(64)}`,
};

describe('ConfigurationStudioService TP-1 runtime boundary', () => {
  let metrics: ConfigurationRuntimeMetrics;
  let service: ConfigurationStudioService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY = 'local-uat';
    metrics = new ConfigurationRuntimeMetrics();
    service = new ConfigurationStudioService(
      new ConfigurationManifestCache(),
      undefined,
      undefined,
      metrics,
    );
    database.tenantModuleEntitlement.findUnique.mockResolvedValue({
      status: 'ENABLED',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: null,
    });
    database.configurationActivation.findFirst.mockResolvedValue({
      id: 'activation-1',
      publishedVersionId: 'published-1',
      activatedAt: new Date('2026-09-24T00:00:00.000Z'),
      publishedVersion: { manifest, checksum: manifest.checksum },
    });
    database.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('rejects mismatched legacy scope assertions before any database access', async () => {
    await expect(
      service.runtimeManifest(
        'tenant-1',
        'tenant-settings',
        'tenant-profile',
        'profile-extension',
        'production',
        'all-users',
        ['configuration-runtime:read'],
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(database.tenantModuleEntitlement.findUnique).not.toHaveBeenCalled();
    expect(database.configurationActivation.findFirst).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toContainEqual({
      operation: 'legacy',
      result: 'scope-denied',
      count: 1,
    });
  });

  it('resolves current scope on the server and enforces the durable entitlement', async () => {
    const response = await service.currentRuntimeManifest(
      'tenant-1',
      'tenant-settings',
      'tenant-profile',
      'profile-extension',
      ['configuration-runtime:read'],
    );

    expect(database.tenantModuleEntitlement.findUnique).toHaveBeenCalledWith({
      where: { tenantId_moduleKey: { tenantId: 'tenant-1', moduleKey: 'tenant-access' } },
      select: { status: true, startsAt: true, endsAt: true },
    });
    expect(response.scope).toMatchObject({
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      entitlementModuleKey: 'tenant-access',
    });
    expect(response.adapter).toEqual({
      adapterKey: 'tenant-profile-v1',
      descriptorVersion: '1.0',
    });
  });

  it('preserves legacy tenant-application consumers during the compatibility window', async () => {
    await service.runtimeManifest(
      'tenant-1',
      'tenant-apps',
      'custom-record',
      'custom-form',
      undefined,
      undefined,
      ['configuration-runtime:read'],
    );

    expect(database.tenantModuleEntitlement.findUnique).not.toHaveBeenCalled();
    expect(database.configurationActivation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          moduleKey: 'tenant-apps',
          entityKey: 'custom-record',
          surfaceKey: 'custom-form',
          environmentKey: 'local-uat',
          cohortKey: 'all-users',
        }),
      }),
    );
  });

  it('fails closed when the current durable entitlement is disabled', async () => {
    database.tenantModuleEntitlement.findUnique.mockResolvedValue({
      status: 'DISABLED',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: null,
    });

    const error = await service
      .currentRuntimeManifest(
        'tenant-1',
        'tenant-settings',
        'tenant-profile',
        'profile-extension',
        ['configuration-runtime:read'],
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getResponse()).toEqual({
      contractVersion: '1.0',
      code: 'CONFIGURATION_RUNTIME_SCOPE_DENIED',
      message: 'The requested runtime scope is not available.',
      retryable: false,
    });
    expect(database.configurationActivation.findFirst).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toContainEqual({
      operation: 'current',
      result: 'entitlement-denied',
      count: 1,
    });
  });

  it('rejects an unknown current adapter before entitlement or manifest access', async () => {
    await expect(
      service.currentRuntimeManifest(
        'tenant-1',
        'tenant-settings',
        'tenant-profile',
        'unknown-surface',
        ['configuration-runtime:read'],
      ),
    ).rejects.toBeInstanceOf(HttpException);

    expect(database.tenantModuleEntitlement.findUnique).not.toHaveBeenCalled();
    expect(database.configurationActivation.findFirst).not.toHaveBeenCalled();
    expect(metrics.snapshot()).toContainEqual({
      operation: 'current',
      result: 'adapter-not-found',
      count: 1,
    });
  });

  it('audits privileged previews without creating cohort membership', async () => {
    await service.previewRuntimeManifest(
      'tenant-1',
      'actor-1',
      'tenant-settings',
      'tenant-profile',
      'profile-extension',
      'local-uat',
      'all-users',
      ['configuration-runtime:read', 'configuration:read'],
    );

    expect(database.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'actor-1',
        resource: 'configuration-runtime-preview',
        metadata: expect.objectContaining({
          eventType: 'configuration.runtime.previewed.v1',
          adapterKey: 'tenant-profile-v1',
        }),
      }),
    });
  });
});
