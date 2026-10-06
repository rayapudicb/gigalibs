import { describe, expect, it } from 'vitest';
import { moduleDefaultRoles } from '../modules/roles.generated.js';
import { TenantPermissionSchema, isTenantPermissionCode } from './index.js';

// WI-OI-103e (ADR-0016 F16): tenant roles may grant module permissions such as analytics:charts:write.
describe('tenant permission codes', () => {
  // WI-OI-120n: and the dotted codes CMMS, Workforce and Geospatial check, so their module roles reach the session.
  it.each([
    'analytics:read',
    'analytics:*',
    'analytics:charts:write',
    'analytics:models:publish',
    'master-data:read',
    'cmms.work-orders.write',
    'workforce.time.punch',
    'maps.nodes.read',
    'workforce.timesheets.approve',
  ])(
    'accepts %s',
    (code) => {
      expect(isTenantPermissionCode(code)).toBe(true);
      expect(TenantPermissionSchema.safeParse(code).success).toBe(true);
    },
  );

  it.each([
    'platform:tenants:write',
    'platform:*',
    'analytics:charts:*',
    'analytics:*:write',
    'analytics:a:b:c',
    'Analytics:read',
    'analytics',
    '*',
    'analytics:charts:write ',
    'platform.tenants.write',
    'cmms.*',
    'cmms.work-orders.*',
    'cmms',
    'cmms.a.b.c.d',
    'Cmms.work-orders.read',
    'cmms..read',
    'cmms.work-orders:write',
    42,
  ])('refuses %s', (code) => {
    expect(isTenantPermissionCode(code)).toBe(false);
    expect(TenantPermissionSchema.safeParse(code).success).toBe(false);
  });
});

// WI-OI-120n: a module role's permission that failed this check was silently dropped from the session, so no
// CMMS or Workforce role could ever work. Every declared module role must pass it whole.
describe('module default roles', () => {
  it.each(moduleDefaultRoles.map((role) => [role.name, role.permissions] as const))('%s carries only tenant permission codes', (_name, permissions) => {
    expect(permissions.filter((code) => !isTenantPermissionCode(code))).toEqual([]);
  });

  it('includes the maintenance and Workforce roles', () => {
    expect(moduleDefaultRoles.map((role) => role.name)).toEqual(
      expect.arrayContaining(['Maintenance technician', 'Maintenance planner', 'Maintenance viewer', 'Workforce member', 'Workforce supervisor']),
    );
  });
});
