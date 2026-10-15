import { platformModuleCatalog } from '@gigalibs/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canOpenPlatformModule,
  canUseTenantModule,
  hasPermission,
  isLockedModule as isCatalogueLocked,
  mostSpecificActiveModuleKey,
  tenantModulePermission,
} from '../lib/module-access';
import { UAT_PREVIEW_SETTING, uatPreviewEnabled } from '../lib/uat-module-status';
import { isLockedModule } from './helpers/locked-modules';

describe('module access', () => {
  it('supports global and resource wildcards without crossing resources', () => {
    expect(hasPermission(['*'], 'ap:read')).toBe(true);
    expect(hasPermission(['ap:*'], 'ap:read')).toBe(true);
    expect(hasPermission(['value:*'], 'ap:read')).toBe(false);
  });

  it('lets a resource wildcard cover granular dotted permissions of the same resource only', () => {
    expect(hasPermission(['workforce:*'], 'workforce.resources.read')).toBe(true);
    expect(hasPermission(['workforce:*'], 'workforce.capabilities.manage')).toBe(true);
    expect(hasPermission(['workforce:read'], 'workforce.resources.read')).toBe(false);
    expect(hasPermission(['cmms:*'], 'workforce.resources.read')).toBe(false);
    expect(hasPermission(['workforce-x:*'], 'workforce.resources.read')).toBe(false);
  });

  it('requires both an entitlement and the role permission', () => {
    const enabled = new Set(['invoice-matching']);
    expect(canUseTenantModule('invoice-matching', enabled, ['ap:read'])).toBe(true);
    expect(canUseTenantModule('invoice-matching', enabled, ['content:read'])).toBe(false);
    expect(canUseTenantModule('value-ledger', enabled, ['value:read'])).toBe(false);
  });

  it('does not treat catalogue visibility as permission to open tenant settings', () => {
    const enabled = new Set(['tenant-access', 'personal-security']);
    expect(canUseTenantModule('tenant-access', enabled, ['profile:*'])).toBe(false);
    expect(canUseTenantModule('personal-security', enabled, ['profile:*'])).toBe(true);
  });

  it('derives every tenant permission from the canonical module catalogue', () => {
    for (const module of platformModuleCatalog) {
      if (module.requiredPermission) {
        expect(tenantModulePermission[module.key]).toBe(module.requiredPermission);
      } else {
        expect(tenantModulePermission[module.key]).toBeUndefined();
      }
    }
  });

  it('does not let a platform role substitute for a tenant entitlement on ordinary modules', () => {
    const marketplace = platformModuleCatalog.find((module) => module.key === 'module-marketplace')!;
    expect(
      canOpenPlatformModule(marketplace, {
        tenant: { features: [] },
        permissions: ['marketplace:read'],
        platformRoles: ['PLATFORM_ADMIN'],
      }),
    ).toBe(false);
  });

  it('opens the reviewed GigaOps slice only with its tenant entitlement and permission', () => {
    const gigaOps = platformModuleCatalog.find((module) => module.key === 'gigaops')!;
    expect(gigaOps.readiness).toBe('REVIEW');
    expect(gigaOps.entitlementEligible).toBe(true);
    expect(gigaOps.requiredPermission).toBe('workforce:read');
    expect(
      canOpenPlatformModule(gigaOps, {
        tenant: { features: ['gigaops'] },
        permissions: ['workforce:read'],
        platformRoles: [],
      }),
    ).toBe(true);
    expect(
      canOpenPlatformModule(gigaOps, {
        tenant: { features: [] },
        permissions: [],
        platformRoles: ['PLATFORM_ADMIN'],
      }),
    ).toBe(true);
  });

  it('refuses every locked catalogue entry, even with its feature and every permission', () => {
    const locked = platformModuleCatalog.filter((module) => isLockedModule(module.key));
    expect(locked.length).toBeGreaterThan(0);
    for (const module of locked) expect(canUseTenantModule(module.key, new Set([module.key]), ['*']), module.key).toBe(false);
  });

  it('refuses a locked module even with its feature and every permission (ADR-0016 F6)', () => {
    for (const key of ['esignature', 'accounts-receivable', 'rule-studio']) {
      expect(platformModuleCatalog.find((module) => module.key === key)?.readiness, key).toBe('CONTAINED');
      expect(canUseTenantModule(key, new Set([key]), ['*']), key).toBe(false);
    }
    expect(canUseTenantModule('asset-maintenance', new Set(['asset-maintenance']), ['*'])).toBe(true);
  });

  it('requires a tenant context for explicitly declared module inspection', () => {
    // Accounts Receivable declares platform inspection. It is frozen and locked (ADR-0016 F6, WI-OI-102e), so the
    // inspection rule is checked on an openable copy, and the locked entry must stay closed even to operators.
    const locked = platformModuleCatalog.find((module) => module.key === 'accounts-receivable')!;
    expect(locked.readiness).toBe('CONTAINED');
    expect(
      canOpenPlatformModule(locked, { tenant: { features: [] }, permissions: [], platformRoles: ['PLATFORM_ADMIN'] }),
    ).toBe(false);
    const ar = { ...locked, readiness: 'REVIEW' as const };
    expect(
      canOpenPlatformModule(ar, {
        tenant: null,
        permissions: [],
        platformRoles: ['PLATFORM_ADMIN'],
      }),
    ).toBe(false);
    expect(
      canOpenPlatformModule(ar, {
        tenant: { features: [] },
        permissions: [],
        platformRoles: ['PLATFORM_ADMIN'],
      }),
    ).toBe(true);
  });

  it('chooses the most-specific module route for the active navigation state', () => {
    const modules = platformModuleCatalog.filter((module) =>
      ['connections', 'connector-hub'].includes(module.key),
    );
    expect(mostSpecificActiveModuleKey(modules, '/connections/oauth-studio')).toBe('connector-hub');
    expect(mostSpecificActiveModuleKey(modules, '/connections/example')).toBe('connections');
  });

  it.skipIf(
    ['accounts-receivable', 'spend-management', 'tax-configuration', 'multi-currency', 'autonomous-recovery'].every(isLockedModule),
  ).each([
    ['accounts-receivable', 'ar:read'],
    ['spend-management', 'spend:read'],
    ['tax-configuration', 'tax:read'],
    ['multi-currency', 'currency:read'],
    ['autonomous-recovery', 'recovery:read'],
  ])(
    'requires entitlement and tenant permission for finance module %s',
    (moduleKey, permission) => {
      expect(canUseTenantModule(moduleKey, new Set([moduleKey]), [permission])).toBe(true);
      expect(canUseTenantModule(moduleKey, new Set(), [permission])).toBe(false);
      expect(canUseTenantModule(moduleKey, new Set([moduleKey]), [])).toBe(false);
    },
  );
});

describe('UAT preview (WI-OI-120a)', () => {
  const lockedKeys = ['financial-operations', 'universal-procurement', 'accounts-receivable', 'esignature'];
  // WI-OI-120ak (S5, D1b): the preview opens PLANNED modules only; CONTAINED ones stay locked.
  const plannedKeys = ['financial-operations', 'universal-procurement'];
  const containedKeys = ['accounts-receivable', 'esignature', 'communications-textfly', 'rule-studio'];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps locked modules refused unless the setting is exactly "enabled"', () => {
    for (const value of ['', 'true', '1', 'ENABLED', 'yes']) {
      vi.stubEnv(UAT_PREVIEW_SETTING, value);
      expect(uatPreviewEnabled(), value).toBe(false);
      for (const key of lockedKeys) expect(canUseTenantModule(key, new Set([key]), ['*']), `${key} ${value}`).toBe(false);
    }
  });

  it('lifts the lock of a PLANNED module on the UAT instance but still requires the entitlement and the permission', () => {
    vi.stubEnv(UAT_PREVIEW_SETTING, 'enabled');
    expect(uatPreviewEnabled()).toBe(true);
    for (const key of plannedKeys) {
      expect(isCatalogueLocked(key), key).toBe(true);
      expect(canUseTenantModule(key, new Set([key]), ['*']), key).toBe(true);
      expect(canUseTenantModule(key, new Set(), ['*']), `${key} without entitlement`).toBe(false);
      expect(canUseTenantModule(key, new Set([key]), []), `${key} without permission`).toBe(false);
    }
  });

  it('keeps a CONTAINED module locked even on the UAT instance, for tenants and for platform inspection', () => {
    vi.stubEnv(UAT_PREVIEW_SETTING, 'enabled');
    for (const key of containedKeys) {
      const entry = platformModuleCatalog.find((module) => module.key === key)!;
      expect(entry.readiness, key).toBe('CONTAINED');
      expect(canUseTenantModule(key, new Set([key]), ['*']), key).toBe(false);
      expect(canUseTenantModule(key, new Set([key]), ['*'], { uatPreview: true }), `${key} explicit`).toBe(false);
      const session = { tenant: { features: [key] }, permissions: ['*'], platformRoles: ['PLATFORM_ADMIN'], uatPreview: true };
      expect(canOpenPlatformModule(entry, session), `${key} screen`).toBe(false);
    }
  });

  it('lets a client component pass the server answer explicitly, overriding its own environment', () => {
    vi.stubEnv(UAT_PREVIEW_SETTING, '');
    expect(canUseTenantModule('financial-operations', new Set(['financial-operations']), ['*'], { uatPreview: true })).toBe(
      true,
    );
    vi.stubEnv(UAT_PREVIEW_SETTING, 'enabled');
    expect(
      canUseTenantModule('financial-operations', new Set(['financial-operations']), ['*'], { uatPreview: false }),
    ).toBe(false);
  });

  it('lists a PLANNED module in navigation only on the UAT instance, and never without a tenant', () => {
    const finance = platformModuleCatalog.find((module) => module.key === 'financial-operations')!;
    expect(finance.readiness).toBe('PLANNED');
    const session = { tenant: { features: ['financial-operations'] }, permissions: ['*'], platformRoles: [] };
    expect(canOpenPlatformModule(finance, { ...session, uatPreview: false })).toBe(false);
    expect(canOpenPlatformModule(finance, { ...session, uatPreview: true })).toBe(true);
    expect(canOpenPlatformModule(finance, { ...session, tenant: null, uatPreview: true })).toBe(false);
  });
});
