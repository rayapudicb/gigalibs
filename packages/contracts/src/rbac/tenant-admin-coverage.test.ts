import { describe, expect, it } from 'vitest';
import { platformModuleCatalog } from '../modules/index.js';
import { baseRolePermissions } from './base-roles.js';
import { dutyConflictCodes } from './duty-conflicts.js';
import { holdsPermission } from './permission-match.js';

// Owner, 2026-11-01: a Tenant Admin opens every licensed business module through the base role, never through seeded
// direct permissions or a per-module role (which the Workforce duty-conflict check refuses for a Tenant Admin). The
// module's entitlement still gates it. A new entitlement-eligible module fails here until its family is added to
// TENANT_ADMIN in base-roles.ts, or it is listed below with the owner decision that keeps it out.
const NOT_TENANT_ADMIN_MODULES: Readonly<Record<string, string>> = {
  // Platform features rather than business modules; no owner decision yet that Tenant Admins hold them by default.
  'module-marketplace': 'platform feature: plan and module browsing',
  'solution-packs': 'platform feature: solution pack installation',
};

describe('Tenant Admin base role covers every licensed business module', () => {
  const admin = baseRolePermissions('TENANT_ADMIN');
  const offered = platformModuleCatalog.filter(
    (module) => module.entitlementEligible && module.readiness !== 'CONTAINED' && module.requiredPermission,
  );

  it.each(offered.filter((module) => !(module.key in NOT_TENANT_ADMIN_MODULES)).map((module) => [module.key, module.requiredPermission!]))(
    '%s: a Tenant Admin holds %s',
    (_key, requiredPermission) => {
      expect(holdsPermission(admin, requiredPermission)).toBe(true);
    },
  );

  it('lists only real, offered modules as exceptions', () => {
    const offeredKeys = new Set(offered.map((module) => module.key));
    expect(Object.keys(NOT_TENANT_ADMIN_MODULES).filter((key) => !offeredKeys.has(key))).toEqual([]);
  });

  it('gives no side of a separated duty through a business-module family', () => {
    const businessFamilies = ['iot:*', 'business-partners:*', 'speed:*', 'universal-manufacturing:*', 'universal-returns:*', 'project-operations:*', 'operator-rounds:*'];
    expect(businessFamilies.every((family) => admin.includes(family))).toBe(true);
    expect(dutyConflictCodes().filter((code) => holdsPermission(businessFamilies, code))).toEqual([]);
  });
});
