import { platformModuleCatalog } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import {
  canInspectPlatformModule,
  canUseTenantModule,
  hasPermission,
  tenantModulePermission,
} from '../lib/module-access';

describe('module access', () => {
  it('supports global and resource wildcards without crossing resources', () => {
    expect(hasPermission(['*'], 'ap:read')).toBe(true);
    expect(hasPermission(['ap:*'], 'ap:read')).toBe(true);
    expect(hasPermission(['value:*'], 'ap:read')).toBe(false);
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
