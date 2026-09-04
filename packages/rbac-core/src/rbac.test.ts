import { describe, expect, it } from 'vitest';
import { PermissionEvaluator } from './evaluator.js';

describe('PermissionEvaluator & SaaS Delegation', () => {
  it('resolves direct role permissions correctly', () => {
    const user = { roleId: 'role_finance' };
    const roles = [
      {
        id: 'role_finance',
        modules: {
          invoices: { read: true, create: true, edit: true, delete: false, approve: true, export: true },
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
          invoices: { read: true, create: false, edit: false, delete: false, approve: false, export: false },
          analytics: { read: true, create: false, edit: false, delete: false, approve: false, export: false },
        },
      },
      {
        id: 'role_approver',
        modules: {
          invoices: { read: true, create: true, edit: true, delete: false, approve: true, export: true },
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
    expect(effective.invoices.approve).toBe(true);
    expect(effective.invoices.create).toBe(true);
    // Analytics should keep the read permission from direct role
    expect(effective.analytics.read).toBe(true);
    expect(effective.analytics.create).toBe(false);
  });
});
