import {
  CONTROL_PLANE_PERMISSIONS,
  type MemberRoleScope,
  assignmentScopeConflicts,
  assignmentScopeKey,
  baseRolePermissions,
  explicitScopeRefusal,
  holdsPermission,
  isTenantPermissionCode,
  platformModuleCatalog,
} from '@gigalibs/contracts';
import { primaryVersionInForce } from '@gigalibs/auth-nest';
import type { Prisma } from '@gigalibs/db';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { expandRole, loadRoleGraph, type RoleGraph } from './role-graph.js';

// WI-OI-120w (R2 slice 2b, ADR-0034 §1 and §6): where a role applies, checked where it is given, and the transition
// rule checked wherever a member's access can change scope (a role given, a role's permissions edited, a base role
// changed): a module that still reads one scope per request must receive this member's permissions from one scope.

export interface ResolvedRoleScope {
  readonly scope: 'MEMBER' | 'WORKSPACE' | 'UNITS' | 'PLACES';
  readonly unitIds: string[];
  readonly placeIds: string[];
}

/**
 * The scope a role is given at, validated. Units must be active units placed in the primary tree's version in force.
 * A role carrying a control-plane permission applies to the whole workspace or the member's own scope only: the control
 * plane scopes nothing by unit or place, so a narrower scope would be silently wider there.
 */
export async function resolveRoleScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scope: MemberRoleScope,
  rolePermissions: readonly string[],
): Promise<ResolvedRoleScope> {
  if (scope.kind === 'MEMBER' || scope.kind === 'WORKSPACE') return { scope: scope.kind, unitIds: [], placeIds: [] };
  const controlPlane = CONTROL_PLANE_PERMISSIONS.filter((code) => holdsPermission(rolePermissions, code));
  if (controlPlane.length > 0)
    throw new UnprocessableEntityException({
      code: 'ROLE_SCOPE_WORKSPACE_ONLY',
      message: `This role carries workspace permissions (${controlPlane.slice(0, 5).join(', ')}${controlPlane.length > 5 ? ', …' : ''}); give it for the whole workspace or the person's own scope.`,
    });
  // Security review of 2b (H1, H2): only a module proven to limit its records by units or places may receive a role
  // given there; anything else would act everywhere while the screen said otherwise.
  assertScopeEnforced(rolePermissions, scope.kind === 'UNITS' ? 'units' : 'places');
  if (scope.kind === 'PLACES') return { scope: 'PLACES', unitIds: [], placeIds: [...scope.placeIds] };
  const versionId = await primaryVersionInForce(tx, tenantId);
  if (!versionId)
    throw new UnprocessableEntityException({
      code: 'ROLE_SCOPE_NO_ORGANIZATION',
      message: 'Units can be chosen once the organization has a version in force (Settings → Organization).',
    });
  const found = new Set(
    (
      await tx.$queryRaw<Array<{ unitId: string }>>`
        SELECT u.id AS "unitId" FROM org_units u
          JOIN org_hierarchy_edges e ON e."tenantId" = u."tenantId" AND e."versionId" = ${versionId} AND e."unitId" = u.id
         WHERE u."tenantId" = ${tenantId} AND u.id = ANY(${scope.unitIds}::text[]) AND u.status = 'ACTIVE'`
    ).map((row) => row.unitId),
  );
  const missing = scope.unitIds.filter((unitId) => !found.has(unitId));
  if (missing.length > 0)
    throw new UnprocessableEntityException({
      code: 'ROLE_SCOPE_UNKNOWN_UNITS',
      message: 'Choose active units of the organization in force.',
      missing,
    });
  return { scope: 'UNITS', unitIds: [...scope.unitIds], placeIds: [] };
}

/** Refuses permissions at units or places unless every module that checks them is proven to limit by that dimension. */
export function assertScopeEnforced(permissions: readonly string[], dimension: 'units' | 'places'): void {
  const refusal = explicitScopeRefusal(permissions, dimension);
  if (!refusal) return;
  const owners = refusal.owners.map((owner) => (owner === 'platform' ? 'the platform' : platformModuleCatalog.find((module) => module.key === owner)?.name ?? owner));
  throw new UnprocessableEntityException({
    code: 'ROLE_SCOPE_NOT_ENFORCED',
    message: `${refusal.code} is checked by ${owners.join(', ')}, which does not yet limit records by ${dimension}; give this role for the whole workspace or the person's own scope.`,
    permission: refusal.code,
  });
}

/**
 * Refuses a change that would let a module still reading one scope receive this member's permissions from two scopes.
 * `change` describes the member after the change: a new base role, a role's new permissions, or one more assignment.
 */
export async function assertScopesConsistent(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  change: {
    readonly baseRole?: string;
    /** The workspace's roles as they will be (a role edit); by default as they are. */
    readonly graph?: RoleGraph;
    readonly add?: { readonly permissions: readonly string[]; readonly scope: ResolvedRoleScope };
  } = {},
): Promise<void> {
  const member = await tx.tenantMember.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true, permissions: true },
  });
  if (!member) return;
  const live = await tx.memberRoleAssignment.findMany({
    where: { tenantId, userId, revokedAt: null },
    select: { customRoleId: true, scope: true, unitIds: true, placeIds: true },
  });
  // WI-OI-120w (R2 slice 2c): each role with everything it includes (read only when the member holds roles).
  const graph = live.length > 0 ? (change.graph ?? (await loadRoleGraph(tx, tenantId))) : undefined;
  const grants = [
    {
      permissions: [...baseRolePermissions(change.baseRole ?? member.role), ...(member.permissions ?? []).filter(isTenantPermissionCode)],
      scopeKey: 'MEMBER',
    },
    ...live.map((assignment) => ({
      permissions: expandRole(graph!, assignment.customRoleId),
      scopeKey: assignmentScopeKey({ kind: assignment.scope, unitIds: assignment.unitIds, placeIds: assignment.placeIds }),
    })),
    ...(change.add ? [{ permissions: [...change.add.permissions], scopeKey: assignmentScopeKey({ kind: change.add.scope.scope, unitIds: change.add.scope.unitIds, placeIds: change.add.scope.placeIds }) }] : []),
  ];
  const conflicts = assignmentScopeConflicts(grants);
  if (conflicts.length > 0) {
    const names = conflicts.map((key) => platformModuleCatalog.find((module) => module.key === key)?.name ?? key);
    throw new ConflictException({
      code: 'ROLE_SCOPE_CONFLICT',
      message: `${names.join(', ')} would receive this person's access from two different scopes. Until it decides access role by role, give all of their roles for it at one scope.`,
      modules: conflicts,
    });
  }
}
