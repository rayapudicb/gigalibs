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

  it('keeps viewer authority outside finance modules', () => {
    const hierarchy = createDefaultRoleHierarchy();
    const permissions = hierarchy.resolveUserPermissions(['VIEWER']);
    expect(permissions.some((permission) => permission.startsWith('tax:'))).toBe(false);
    expect(permissions.some((permission) => permission.startsWith('ar:'))).toBe(false);
  });
});
