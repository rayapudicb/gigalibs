import { describe, expect, it } from 'vitest';
import { AssignMemberRoleSchema, RevokeMemberRoleSchema, UpdateTenantMemberSchema } from './index.js';

// WI-OI-120w (R2 slice 2a, Security review): roles change only through role assignments, each with a reason counted in
// characters as the database counts it.
describe('member role changes', () => {
  const update = { expectedUpdatedAt: '2026-10-06T00:00:00.000Z', reason: 'Moved to nights' };

  it('refuses a role on the member update; roles are given through role assignments', () => {
    expect(UpdateTenantMemberSchema.safeParse({ ...update, customRoleId: 'role-1' }).success).toBe(false);
    expect(UpdateTenantMemberSchema.safeParse({ ...update, customRoleId: null }).success).toBe(false);
    expect(UpdateTenantMemberSchema.safeParse({ ...update, customRoleId: 'role-1', status: 'ACTIVE' }).success).toBe(false);
    expect(UpdateTenantMemberSchema.safeParse({ ...update, status: 'SUSPENDED' }).success).toBe(true);
  });

  it('counts a reason in characters', () => {
    expect(AssignMemberRoleSchema.safeParse({ customRoleId: 'role-1', reason: '👍👍' }).success).toBe(false);
    expect(AssignMemberRoleSchema.safeParse({ customRoleId: 'role-1', reason: '👍👍👍' }).success).toBe(true);
    expect(RevokeMemberRoleSchema.safeParse({ reason: '  ab  ' }).success).toBe(false);
    expect(RevokeMemberRoleSchema.safeParse({ reason: '😀'.repeat(500) }).success).toBe(true);
    expect(RevokeMemberRoleSchema.safeParse({ reason: '😀'.repeat(501) }).success).toBe(false);
  });
});
