import { BASE_ROLE_DEFINITIONS, baseRoleAdditions, baseRolePermissions } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import { createDefaultRoleHierarchy } from './default-roles.js';
import { PermissionEvaluator } from './evaluator.js';

describe('PermissionEvaluator & SaaS Delegation', () => {
  it('resolves direct role permissions correctly', () => {
    const user = { roleId: 'role_finance' };
    const roles = [
      {
        id: 'role_finance',
        modules: {
          invoices: {
            read: true,
            create: true,
            edit: true,
            delete: false,
            approve: true,
            export: true,
          },
        },
      },
    ];

    const effective = PermissionEvaluator.resolveEffectivePermissions(user, roles);
    expect(effective.invoices).toEqual({
      read: true,
      create: true,
      edit: true,
      delete: false,
      approve: true,
      export: true,
    });
  });

  it('merges inherited role permissions from squad groups with direct role', () => {
    const user = {
      roleId: 'role_viewer',
      groupIds: ['grp_emea_leads'],
    };

    const roles = [
      {
        id: 'role_viewer',
        modules: {
          invoices: {
            read: true,
            create: false,
            edit: false,
            delete: false,
            approve: false,
            export: false,
          },
          analytics: {
            read: true,
            create: false,
            edit: false,
            delete: false,
            approve: false,
            export: false,
          },
        },
      },
      {
        id: 'role_approver',
        modules: {
          invoices: {
            read: true,
            create: true,
            edit: true,
            delete: false,
            approve: true,
            export: true,
          },
        },
      },
    ];

    const groups = [
      {
        id: 'grp_emea_leads',
        defaultRoleId: 'role_approver',
      },
    ];

    const effective = PermissionEvaluator.resolveEffectivePermissions(user, roles, groups);
    // Invoices should inherit the higher approve/create permissions from squad role
    expect(effective.invoices).toMatchObject({ approve: true, create: true });
    // Analytics should keep the read permission from direct role
    expect(effective.analytics).toMatchObject({ read: true, create: false });
  });
});

describe('default tenant finance authority', () => {
  it('gives tenant administrators the registered finance permissions without a platform role', () => {
    const hierarchy = createDefaultRoleHierarchy();
    const permissions = hierarchy.resolveUserPermissions(['TENANT_ADMIN']);
    for (const resource of ['ar', 'spend', 'tax', 'currency', 'recovery']) {
      expect(permissions).toContain(`${resource}:*`);
    }
  });

  it('gives tenant administrators Workforce authority but not managers or members', () => {
    const hierarchy = createDefaultRoleHierarchy();
    expect(hierarchy.resolveUserPermissions(['TENANT_ADMIN'])).toContain('workforce:*');
    for (const role of ['MANAGER', 'MEMBER', 'VIEWER']) {
      const permissions = hierarchy.resolveUserPermissions([role]);
      expect(permissions.some((permission) => permission.startsWith('workforce'))).toBe(false);
    }
  });

  it('gives tenant administrators Geospatial authority but not managers or members', () => {
    const hierarchy = createDefaultRoleHierarchy();
    expect(hierarchy.resolveUserPermissions(['TENANT_ADMIN'])).toContain('maps:*');
    for (const role of ['MANAGER', 'MEMBER', 'VIEWER']) {
      const permissions = hierarchy.resolveUserPermissions([role]);
      expect(permissions.some((permission) => permission.startsWith('maps'))).toBe(false);
    }
  });

  it('gives tenant administrators CMMS authority but not managers or members (WI-OI-038)', () => {
    const hierarchy = createDefaultRoleHierarchy();
    expect(hierarchy.resolveUserPermissions(['TENANT_ADMIN'])).toContain('cmms:*');
    for (const role of ['MANAGER', 'MEMBER', 'VIEWER']) {
      const permissions = hierarchy.resolveUserPermissions([role]);
      expect(permissions.some((permission) => permission.startsWith('cmms'))).toBe(false);
    }
  });

  it('keeps viewer authority outside finance modules', () => {
    const hierarchy = createDefaultRoleHierarchy();
    const permissions = hierarchy.resolveUserPermissions(['VIEWER']);
    expect(permissions.some((permission) => permission.startsWith('tax:'))).toBe(false);
    expect(permissions.some((permission) => permission.startsWith('ar:'))).toBe(false);
  });
});

// WI-OI-120q (R1): the control-plane guard and SCIM use the one permission rule.
describe('PermissionEvaluator.match', () => {
  it('covers with `*`, the same code in either spelling, or the family wildcard', () => {
    expect(PermissionEvaluator.match('*', 'users:read')).toBe(true);
    expect(PermissionEvaluator.match('users:read', 'users:read')).toBe(true);
    expect(PermissionEvaluator.match('parties:identifiers:manage', 'parties:identifiers.manage')).toBe(true);
    expect(PermissionEvaluator.match('users:*', 'users:read')).toBe(true);
    expect(PermissionEvaluator.match('organization:*', 'organization.units.read')).toBe(true);
  });

  it('no longer treats `all`, `*:action`, a shorter grant or a third part as a wildcard or a scope', () => {
    expect(PermissionEvaluator.match('all', 'users:read')).toBe(false);
    expect(PermissionEvaluator.match('*:read', 'users:read')).toBe(false);
    expect(PermissionEvaluator.match('finance:journals', 'finance:journals:post')).toBe(false);
    expect(PermissionEvaluator.match('finance:journals:post', 'finance:journals:approve')).toBe(false);
    expect(PermissionEvaluator.match('users:delete:own', 'users:delete', { userId: 'u1', resourceOwnerId: 'u1' })).toBe(false);
    expect(PermissionEvaluator.hasAllPermissions(['users:read', 'users:*'], ['users:read', 'users:update'])).toBe(true);
    expect(PermissionEvaluator.hasAllPermissions(['users:read'], ['users:read', 'users:update'])).toBe(false);
  });
});

// WI-OI-120x: the web reads base roles from @gigalibs/contracts; the control plane resolves them here. Both agree.
describe('base roles shared with the web', () => {
  it('resolves every base role to the same permissions as the hierarchy', () => {
    const hierarchy = createDefaultRoleHierarchy();
    for (const role of [...BASE_ROLE_DEFINITIONS.map((definition) => definition.name), 'GUEST'])
      expect(new Set(baseRolePermissions(role))).toEqual(new Set(hierarchy.resolveUserPermissions([role])));
    expect(baseRolePermissions('GUEST')).toEqual([]);
  });

  it('adds only what the next role holds beyond the current one', () => {
    expect(baseRoleAdditions('MANAGER', 'VIEWER')).toEqual([]);
    expect(baseRoleAdditions('MEMBER', 'MANAGER')).toEqual(expect.arrayContaining(['workflows:*', 'spend:approve']));
    expect(baseRoleAdditions('MEMBER', 'MANAGER')).not.toContain('users:read');
    expect(baseRoleAdditions(null, 'VIEWER').sort()).toEqual(baseRolePermissions('VIEWER').sort());
    expect(baseRoleAdditions('VIEWER', 'GUEST')).toEqual([]);
  });
});

