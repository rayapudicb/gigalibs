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

  // WI-OI-120n (security review): every workspace receives module roles and cannot edit them, so they never carry
  // workspace administration, and none carries the administrator-only login link.
  it.each(moduleDefaultRoles.map((role) => [role.name, role.permissions] as const))('%s carries no workspace administration', (_name, permissions) => {
    const admin = /^(users|roles|invites|tenant|settings|billing|audit|retention|security|scim|configuration(-apps|-runtime|-values)?|organization)[:.]/;
    expect(permissions.filter((code) => admin.test(code) || code === 'workforce.resources.link')).toEqual([]);
  });

  it('includes the maintenance and Workforce roles', () => {
    expect(moduleDefaultRoles.map((role) => role.name)).toEqual(
      expect.arrayContaining(['Maintenance technician', 'Maintenance planner', 'Maintenance viewer', 'Workforce member', 'Workforce supervisor']),
    );
  });
});

// WI-OI-120w Security review (P1): a custom role may not take a built-in role's name.
describe('reserved role names', () => {
  it('refuses names that pass for a built-in, platform or authority role, whatever the spelling', async () => {
    const { CreateCustomRoleSchema, UpdateCustomRoleSchema, isReservedRoleName } = await import('./index.js');
    for (const name of ['TENANT_ADMIN', 'Tenant admin', 'tenant-admin', 'Super Admin', 'Owner', 'Platform admin', 'CEO', 'admin', 'Manager'])
      expect(isReservedRoleName(name), name).toBe(true);
    for (const name of ['Workforce member', 'Maintenance planner', 'Journal Approver', 'Regional manager'])
      expect(isReservedRoleName(name), name).toBe(false);
    expect(CreateCustomRoleSchema.safeParse({ name: 'Tenant Admin', permissions: [] }).success).toBe(false);
    expect(UpdateCustomRoleSchema.safeParse({ expectedUpdatedAt: '2026-10-06T00:00:00.000Z', reason: 'rename', name: 'tenant_admin' }).success).toBe(false);
    expect(CreateCustomRoleSchema.safeParse({ name: 'Maintenance lead', permissions: [] }).success).toBe(true);
  });
});

// Security review note: module roles are created without the custom-role schema, so none may take a reserved name;
// the session would leave such a name out of the role list.
describe('module role names', () => {
  it('never use a reserved role name', async () => {
    const { isReservedRoleName } = await import('./index.js');
    expect(moduleDefaultRoles.filter((role) => isReservedRoleName(role.name)).map((role) => role.name)).toEqual([]);
  });
});
