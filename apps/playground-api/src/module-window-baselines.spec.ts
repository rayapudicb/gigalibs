import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120f (F0.2): a module's window is published and activated for a tenant when the module is enabled, as the
// administrator recorded on the entitlement; a tenant's own version stays in force; a repeat changes nothing.
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  configurationActivation: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  configurationPublishedVersion: { findFirst: vi.fn(), create: vi.fn() },
  configurationChangeSet: { create: vi.fn() },
  auditLog: { create: vi.fn(), findFirst: vi.fn() },
  controlOutboxEvent: { create: vi.fn() },
}));
const database = vi.hoisted(() => ({
  $transaction: vi.fn(async (operation: (client: unknown) => unknown) => operation(tx)),
  tenantModuleEntitlement: { findMany: vi.fn() },
}));
const shipped = vi.hoisted(() => ({ baselines: [] as unknown[] }));
vi.mock('@gigalibs/db', () => ({ Prisma: {}, prisma: database }));
vi.mock('@gigalibs/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gigalibs/contracts')>();
  return { ...actual, moduleWindowBaselines: () => shipped.baselines };
});

import { ModuleWindowBaselineV1Schema, type ModuleWindowBaselineV1 } from '@gigalibs/contracts';
import { compileDictionaryPackage } from '@gigalibs/configuration-core';
import { ConfigurationAdapterRegistry } from './configuration-adapter.registry.js';
import { ConfigurationStudioService } from './configuration-studio.service.js';
import { ModuleWindowConfigurationAdapterV1 } from './module-window-configuration.adapter.js';
import { ModuleWindowBaselineService } from './module-window-baselines.service.js';

const field = (fieldKey: string) => ({
  fieldKey,
  entityKey: 'inventory.warehouses',
  label: fieldKey,
  type: 'TEXT',
  required: false,
  readOnly: false,
  isSystemLocked: false,
  classification: 'INTERNAL',
  maskOnDisplay: false,
});

function warehousesWindow(version = '1.0.0', label = 'Warehouses'): ModuleWindowBaselineV1 {
  return ModuleWindowBaselineV1Schema.parse({
    contractVersion: '1.0',
    window: { route: '/inventory', label, description: 'Warehouses of the tenant.', readPermission: 'inventory:read' },
    definition: {
      kind: 'APPLICATION_DICTIONARY',
      contractVersion: '1.0',
      moduleKey: 'universal-inventory',
      entityKey: 'inventory-warehouses',
      surfaceKey: 'inventory-warehouses',
      title: 'Warehouses',
      dictionary: {
        packageKey: 'universal-inventory-warehouses-module-baseline',
        name: 'Warehouses',
        version,
        moduleKey: 'universal-inventory',
        targetEntityKey: 'inventory.warehouses',
        entities: [
          { entityKey: 'inventory.warehouses', moduleKey: 'universal-inventory', label, ownership: 'MODULE_CORE', primaryKeyField: 'id', isVersioned: true, isAuditLogged: true, isSoftDeletable: false },
        ],
        fields: [field('code'), field('name')],
        relationships: [],
        references: [],
        validationRules: [],
        views: [
          {
            viewKey: 'warehouses',
            label,
            mode: 'LIST',
            device: 'ALL',
            searchFields: ['code', 'name'],
            defaultSortDirection: 'ASC',
            tabs: [
              {
                tabKey: 'warehouse',
                label: 'Warehouse',
                position: 0,
                level: 0,
                targetEntityKey: 'inventory.warehouses',
                sections: [],
                fields: [{ fieldKey: 'code', position: 0, span: 6, componentKey: 'text-input' }],
              },
            ],
          },
        ],
        navigation: [],
        actions: [],
        messages: [],
      },
    },
  });
}

function service(baseline: ModuleWindowBaselineV1) {
  return new ConfigurationStudioService(undefined, new ConfigurationAdapterRegistry([new ModuleWindowConfigurationAdapterV1(baseline)]));
}

const checksumOf = (baseline: ModuleWindowBaselineV1) =>
  compileDictionaryPackage(baseline.definition.dictionary, { moduleBaseline: true }).manifest!.checksum;

describe('module window baselines', () => {
  beforeEach(() => {
    vi.stubEnv('CONFIGURATION_RUNTIME_ENVIRONMENT_KEY', 'local');
    tx.configurationActivation.findFirst.mockResolvedValue(null);
    tx.configurationActivation.updateMany.mockResolvedValue({ count: 0 });
    tx.configurationActivation.create.mockResolvedValue({ id: 'activation-new' });
    tx.configurationPublishedVersion.findFirst.mockResolvedValue(null);
    tx.configurationPublishedVersion.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'version-new', ...data }));
    tx.configurationChangeSet.create.mockResolvedValue({ id: 'change-set-new' });
    tx.auditLog.create.mockResolvedValue({});
    tx.auditLog.findFirst.mockResolvedValue(null);
    tx.controlOutboxEvent.create.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('registers a window surface stored by the module record dispatcher', () => {
    const adapter = new ModuleWindowConfigurationAdapterV1(warehousesWindow());
    expect(adapter.descriptor).toMatchObject({
      storageStrategy: 'MODULE_RECORD_DISPATCHER',
      surfaceKey: 'inventory-warehouses',
      surface: { route: '/inventory', modes: ['LIST'] },
      permissions: { runtimeRead: 'inventory:read' },
    });
    expect(adapter.ownsExtensionOwner()).toBe(false);
  });

  it('publishes and activates the window as the given administrator when none is active', async () => {
    const baseline = warehousesWindow();
    const outcome = await service(baseline).activateModuleBaseline('tenant-1', 'admin-1', baseline);
    expect(outcome).toEqual({ status: 'ACTIVATED', checksum: checksumOf(baseline) });
    expect(tx.$queryRaw).toHaveBeenCalled(); // the activation scope lock
    expect(tx.configurationChangeSet.create.mock.calls[0]?.[0].data).toMatchObject({
      status: 'PUBLISHED',
      createdById: 'admin-1',
      approvedById: 'admin-1',
      reason: expect.stringContaining('independent approval is not required'),
    });
    expect(tx.configurationPublishedVersion.create.mock.calls[0]?.[0].data).toMatchObject({ sequence: 1, publishedById: 'admin-1' });
    expect(tx.configurationActivation.create.mock.calls[0]?.[0].data).toMatchObject({
      tenantId: 'tenant-1',
      surfaceKey: 'inventory-warehouses',
      environmentKey: 'local',
      cohortKey: 'all-users',
      activatedById: 'admin-1',
    });
    expect(tx.controlOutboxEvent.create.mock.calls.map(([call]) => call.data.eventType)).toEqual([
      'configuration.version.published.v1',
      'configuration.activation.changed.v1',
    ]);
  });

  it('changes nothing when the same baseline is already active', async () => {
    const baseline = warehousesWindow();
    tx.configurationActivation.findFirst.mockResolvedValue({
      id: 'activation-1',
      publishedVersionId: 'version-1',
      publishedVersion: { checksum: checksumOf(baseline), manifest: { packageKey: 'universal-inventory-warehouses-module-baseline' } },
    });
    await expect(service(baseline).activateModuleBaseline('tenant-1', 'admin-1', baseline)).resolves.toMatchObject({ status: 'UNCHANGED' });
    expect(tx.configurationActivation.create).not.toHaveBeenCalled();
    expect(tx.configurationChangeSet.create).not.toHaveBeenCalled();
  });

  it("keeps the tenant's own published version in force", async () => {
    const baseline = warehousesWindow();
    tx.configurationActivation.findFirst.mockResolvedValue({
      id: 'activation-1',
      publishedVersionId: 'version-tenant',
      publishedVersion: { checksum: 'sha256:tenant', manifest: { packageKey: 'acme.warehouses' } },
    });
    await expect(service(baseline).activateModuleBaseline('tenant-1', 'admin-1', baseline)).resolves.toMatchObject({
      status: 'CUSTOMISED_KEPT',
    });
    expect(tx.configurationActivation.updateMany).not.toHaveBeenCalled();
    expect(tx.configurationActivation.create).not.toHaveBeenCalled();
    // The tenant is told once, in its audit log, that a baseline update waits for review.
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-1', resource: 'configuration-baseline-update', action: 'UPDATE' }),
    });
    tx.auditLog.create.mockClear();
    tx.auditLog.findFirst.mockResolvedValue({ id: 'already-told' });
    await service(baseline).activateModuleBaseline('tenant-1', 'admin-1', baseline);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('replaces an older baseline with the new one', async () => {
    const baseline = warehousesWindow('1.1.0', 'Warehouses and sites');
    tx.configurationActivation.findFirst.mockResolvedValue({
      id: 'activation-1',
      publishedVersionId: 'version-1',
      publishedVersion: { checksum: 'sha256:older', manifest: { packageKey: 'universal-inventory-warehouses-module-baseline' } },
    });
    tx.configurationPublishedVersion.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ sequence: 1 });
    await expect(service(baseline).activateModuleBaseline('tenant-1', 'admin-1', baseline)).resolves.toMatchObject({ status: 'UPGRADED' });
    expect(tx.configurationActivation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }), data: expect.objectContaining({ status: 'INACTIVE' }) }),
    );
    expect(tx.configurationPublishedVersion.create.mock.calls[0]?.[0].data).toMatchObject({ sequence: 2 });
  });

  it('refuses the reserved baseline package key in a tenant package', () => {
    const { definition } = warehousesWindow();
    expect(compileDictionaryPackage(definition.dictionary).findings.map((finding) => finding.code)).toContain(
      'RESERVED_BASELINE_PACKAGE_KEY',
    );
  });

  it('applies the windows of enabled modules only, as the administrator recorded on each entitlement', async () => {
    const baseline = warehousesWindow();
    shipped.baselines = [baseline];
    database.tenantModuleEntitlement.findMany.mockResolvedValue([{ moduleKey: 'universal-inventory', updatedById: 'admin-7' }]);
    const studio = { activateModuleBaseline: vi.fn().mockResolvedValue({ status: 'ACTIVATED', checksum: 'x' }) };
    const outcomes = await new ModuleWindowBaselineService(studio as never).applyForTenant('tenant-9');
    expect(studio.activateModuleBaseline).toHaveBeenCalledWith('tenant-9', 'admin-7', baseline);
    expect(outcomes).toEqual([{ surfaceKey: 'inventory-warehouses', status: 'ACTIVATED' }]);

    database.tenantModuleEntitlement.findMany.mockResolvedValue([]);
    studio.activateModuleBaseline.mockClear();
    await expect(new ModuleWindowBaselineService(studio as never).applyForTenant('tenant-9')).resolves.toEqual([]);
    expect(studio.activateModuleBaseline).not.toHaveBeenCalled();
    shipped.baselines = [];
  });
});
