import { platformModuleCatalog } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import {
  canOpenPlatformModule,
  canInspectPlatformModule,
  canUseTenantModule,
  hasPermission,
  mostSpecificActiveModuleKey,
  tenantModulePermission,
} from '../lib/module-access';

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

  it.each(['/ar', '/spend', '/tax', '/currency', '/recovery'])(
    'lets a persisted platform role inspect contained finance route %s',
    (path) => {
      expect(canInspectPlatformModule(path, ['PLATFORM_ADMIN'])).toBe(true);
      expect(canInspectPlatformModule(path, [])).toBe(false);
    },
  );

  it('does not extend platform inspection to unrelated contained routes', () => {
    expect(canInspectPlatformModule('/scanner', ['PLATFORM_ADMIN'])).toBe(false);
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

  it('requires a tenant context for explicitly declared module inspection', () => {
    const ar = platformModuleCatalog.find((module) => module.key === 'accounts-receivable')!;
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

  it.each([
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
