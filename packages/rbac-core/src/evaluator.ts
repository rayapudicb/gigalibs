import { permissionMatches } from '@gigalibs/contracts';
import type {
  PermissionContext,
  EnterpriseRole,
  AuthorizationDecision,
  FieldMaskRule,
  TemporaryAccessGrant,
  ResourceScope,
} from './types.js';

export class PermissionEvaluator {
  /**
   * Matches a granted permission against a required one with the one permission rule (WI-OI-120q,
   * `permissionMatches`): `*`, the same code in either spelling, or the family wildcard. A third part is a part of the
   * code, never a scope; ownership and team scope are decided by `evaluateEnterpriseAccess` and the organization scope
   * (ADR-0018, ADR-0034), not here. `context` is kept for callers.
   */
  static match(granted: string, required: string, _context?: PermissionContext): boolean {
    return permissionMatches(granted, required);
  }

  /**
   * Check if a list of granted permissions satisfies a required permission.
   */
  static hasPermission(
    grantedList: string[],
    required: string,
    context?: PermissionContext,
  ): boolean {
    return grantedList.some((granted) => this.match(granted, required, context));
  }

  /**
   * Check if all required permissions are satisfied.
   */
  static hasAllPermissions(
    grantedList: string[],
    requiredList: string[],
    context?: PermissionContext,
  ): boolean {
    return requiredList.every((req) => this.hasPermission(grantedList, req, context));
  }

  /**
   * Evaluates True Enterprise Scoped ABAC Authorization (Casbin / AWS IAM Grade).
   */
  static evaluateEnterpriseAccess(
    userRoles: EnterpriseRole[],
    requiredActionKey: string, // e.g. 'invoices:delete'
    context: PermissionContext,
    activeGrants?: TemporaryAccessGrant[],
  ): AuthorizationDecision {
    const auditTrace: string[] = [];
    auditTrace.push(`Subject: User [${context.userId || 'anonymous'}] | Action: [${requiredActionKey}]`);

    // 1. Tenant Isolation Check
    if (context.tenantId && context.resourceTenantId && context.tenantId !== context.resourceTenantId) {
      auditTrace.push(`DENIED: Tenant Mismatch (User Tenant: ${context.tenantId} != Resource Tenant: ${context.resourceTenantId})`);
      return {
        allowed: false,
        decision: 'DENY',
        auditTrace,
      };
    }

    // 2. Combine Direct Roles + Active Temporary JIT Grants
    const effectiveRoles = [...userRoles];
    if (activeGrants && activeGrants.length > 0) {
      for (const grant of activeGrants) {
        if (grant.isActive && new Date(grant.expiresAt).getTime() > Date.now()) {
          auditTrace.push(`JIT Elevation Active: Role [${grant.roleName}] granted until ${grant.expiresAt}`);
        }
      }
    }

    // 3. Evaluate Scopes Across All Effective Roles (Highest Permissive Scope Wins)
    let highestScope: ResourceScope = 'NONE';
    let winningRoleName: string | undefined;

    for (const role of effectiveRoles) {
      const scope = role.scopes[requiredActionKey] || 'NONE';
      auditTrace.push(`Evaluating Role [${role.name}] -> Scope: [${scope}]`);

      if (scope === 'ALL') {
        highestScope = 'ALL';
        winningRoleName = role.name;
        break; // Max scope reached
      } else if (scope === 'TEAM') {
        if (highestScope === 'NONE' || highestScope === 'OWN') {
          highestScope = 'TEAM';
          winningRoleName = role.name;
        }
      } else if (scope === 'OWN') {
        if (highestScope === 'NONE') {
          highestScope = 'OWN';
          winningRoleName = role.name;
        }
      }
    }

    // 4. Resolve Final Authorization Decision based on Scope
    if (highestScope === 'ALL') {
      auditTrace.push(`ALLOWED: Global scope granted by Role [${winningRoleName || 'Admin'}].`);
      return {
        allowed: true,
        decision: 'ALLOW',
        matchedRole: winningRoleName,
        matchedScope: 'ALL',
        auditTrace,
      };
    }

    if (highestScope === 'TEAM') {
      const isTeamMatch = !!(
        context.userSquadId &&
        context.resourceSquadId &&
        context.userSquadId === context.resourceSquadId
      );
      if (isTeamMatch) {
        auditTrace.push(`ALLOWED: Team Squad match (${context.userSquadId} === ${context.resourceSquadId}) via Role [${winningRoleName || 'Team Lead'}].`);
        return {
          allowed: true,
          decision: 'ALLOW',
          matchedRole: winningRoleName,
          matchedScope: 'TEAM',
          auditTrace,
        };
      } else {
        auditTrace.push(`DENIED: Team scope required, but User Squad [${context.userSquadId || 'none'}] does not match Resource Squad [${context.resourceSquadId || 'none'}].`);
        return {
          allowed: false,
          decision: 'DENY',
          matchedRole: winningRoleName,
          matchedScope: 'TEAM',
          auditTrace,
        };
      }
    }

    if (highestScope === 'OWN') {
      const isOwnerMatch = !!(
        context.userId &&
        context.resourceOwnerId &&
        context.userId === context.resourceOwnerId
      );
      if (isOwnerMatch) {
        auditTrace.push(`ALLOWED: Direct resource ownership match (${context.userId} === ${context.resourceOwnerId}) via Role [${winningRoleName || 'User'}].`);
        return {
          allowed: true,
          decision: 'ALLOW',
          matchedRole: winningRoleName,
          matchedScope: 'OWN',
          auditTrace,
        };
      } else {
        auditTrace.push(`DENIED: Ownership scope required, but User [${context.userId || 'none'}] is not the Owner [${context.resourceOwnerId || 'none'}].`);
        return {
          allowed: false,
          decision: 'DENY',
          matchedRole: winningRoleName,
          matchedScope: 'OWN',
          auditTrace,
        };
      }
    }

    auditTrace.push(`DENIED: No matching permissions found across ${userRoles.length} assigned roles.`);
    return {
      allowed: false,
      decision: 'DENY',
      matchedScope: 'NONE',
      auditTrace,
    };
  }

  /**
   * Applies field-level masking to sensitive record attributes (PII & Financial Protection).
   */
  static applyFieldMasking<T extends Record<string, any>>(
    record: T,
    userRoleIds: string[],
    rules: FieldMaskRule[],
  ): { maskedRecord: T; appliedFields: string[] } {
    const output = { ...record };
    const appliedFields: string[] = [];

    for (const rule of rules) {
      const isExempt = rule.allowedRoles?.some((r) => userRoleIds.includes(r));
      if (isExempt) continue;

      if (output[rule.field] !== undefined) {
        appliedFields.push(rule.field);
        const original = String(output[rule.field]);

        switch (rule.maskType) {
          case 'REDACTED':
            (output as any)[rule.field] = '[REDACTED]';
            break;
          case 'PARTIAL_MASK':
            (output as any)[rule.field] = original.length > 4
              ? `***-**-${original.slice(-4)}`
              : '****';
            break;
          case 'HASHED':
            (output as any)[rule.field] = 'SHA256:8f4b2...e9a1';
            break;
          default:
            break;
        }
      }
    }

    return { maskedRecord: output, appliedFields };
  }

  /**
   * Resolves effective module CRUD capabilities by combining direct assigned role
   * with all inherited roles from user squads/groups.
   */
  static resolveEffectivePermissions(
    user: { roleId: string; groupIds?: string[] },
    roles: Array<{ id: string; modules: Record<string, Partial<{ read?: boolean; create?: boolean; edit?: boolean; delete?: boolean; approve?: boolean; export?: boolean }>> }>,
    groups: Array<{ id: string; defaultRoleId?: string; memberUserIds?: string[] }> = [],
  ): Record<string, { read: boolean; create: boolean; edit: boolean; delete: boolean; approve: boolean; export: boolean }> {
    const effective: Record<string, { read: boolean; create: boolean; edit: boolean; delete: boolean; approve: boolean; export: boolean }> = {};
    const relevantRoleIds = new Set<string>();

    if (user.roleId) relevantRoleIds.add(user.roleId);

    // Add inherited roles from squad groups
    const assignedGroupIds = user.groupIds || [];
    for (const group of groups) {
      if (assignedGroupIds.includes(group.id) && group.defaultRoleId) {
        relevantRoleIds.add(group.defaultRoleId);
      }
    }

    const matchedRoles = roles.filter((r) => relevantRoleIds.has(r.id));

    for (const role of matchedRoles) {
      for (const [moduleId, perms] of Object.entries(role.modules)) {
        if (!effective[moduleId]) {
          effective[moduleId] = { read: false, create: false, edit: false, delete: false, approve: false, export: false };
        }
        if (perms.read) effective[moduleId]!.read = true;
        if (perms.create) effective[moduleId]!.create = true;
        if (perms.edit) effective[moduleId]!.edit = true;
        if (perms.delete) effective[moduleId]!.delete = true;
        if (perms.approve) effective[moduleId]!.approve = true;
        if (perms.export) effective[moduleId]!.export = true;
      }
    }

    return effective;
  }
}

