import { z } from 'zod';

// WI-OI-120 (R15, directory groups mapped to scoped roles): an enterprise maps each directory (IdP) group to a scoped
// role, so provisioning a person into a group — over SCIM — grants them that role at that scope, and removing them from
// the group takes it away. Nobody is added by hand. This module holds the pure parts shared by the control plane and
// its tests: the mapping shape, resolving a person's current groups to the roles they should hold, and planning the
// add/revoke needed to reconcile what they hold with that. The control plane applies the plan through the ordinary
// role-assignment engine (so every scope and duty-conflict rule still holds); nothing here touches the database.

/** A directory group maps to a role at WORKSPACE scope or at specific UNITS. (PLACES/MEMBER are not group-mappable.) */
export const DirectoryGroupScopeSchema = z.enum(['WORKSPACE', 'UNITS']);
export type DirectoryGroupScope = z.infer<typeof DirectoryGroupScopeSchema>;

export const SetDirectoryGroupMappingSchema = z
  .object({
    externalGroupId: z.string().trim().min(1).max(256),
    customRoleId: z.string().trim().min(1).max(64),
    scope: DirectoryGroupScopeSchema,
    unitIds: z.array(z.string().trim().min(1).max(64)).max(100).default([]),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((dto) => (dto.scope === 'UNITS' ? dto.unitIds.length > 0 : dto.unitIds.length === 0), {
    message: 'A UNITS mapping needs at least one unit; a WORKSPACE mapping takes none.',
  });
export type SetDirectoryGroupMappingDto = z.infer<typeof SetDirectoryGroupMappingSchema>;

export const RemoveDirectoryGroupMappingSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export type RemoveDirectoryGroupMappingDto = z.infer<typeof RemoveDirectoryGroupMappingSchema>;

/** A person's current directory group membership, pushed by the IdP (over SCIM), to reconcile their roles against. */
export const SyncMemberGroupsSchema = z
  .object({
    email: z.string().trim().email().max(320),
    groupIds: z.array(z.string().trim().min(1).max(256)).max(500),
  })
  .strict();
export type SyncMemberGroupsDto = z.infer<typeof SyncMemberGroupsSchema>;

export interface DirectoryGroupMapping {
  readonly externalGroupId: string;
  readonly customRoleId: string;
  readonly scope: DirectoryGroupScope;
  readonly unitIds: readonly string[];
}

/** A role a person should hold, with where. One per custom role — see {@link resolveGroupRoleGrants} for how clashes merge. */
export interface DesiredRoleGrant {
  readonly customRoleId: string;
  readonly scope: DirectoryGroupScope;
  readonly unitIds: readonly string[];
}

const sortedUnique = (ids: readonly string[]): string[] =>
  [...new Set(ids)].sort((a, b) => a.localeCompare(b));

/**
 * The roles a person should hold given the groups they are in and the tenant's mappings. A role mapped from more than
 * one of the person's groups is granted ONCE: WORKSPACE wins over UNITS (it is broader), and two UNITS mappings merge
 * their units. This keeps a role at a single scope, which the assignment engine requires (a role may not be held at two
 * scopes at once).
 */
export function resolveGroupRoleGrants(
  groupIds: readonly string[],
  mappings: readonly DirectoryGroupMapping[],
): DesiredRoleGrant[] {
  const present = new Set(groupIds);
  const byRole = new Map<string, { scope: DirectoryGroupScope; unitIds: Set<string> }>();
  for (const mapping of mappings) {
    if (!present.has(mapping.externalGroupId)) continue;
    const current = byRole.get(mapping.customRoleId);
    if (!current) {
      byRole.set(mapping.customRoleId, {
        scope: mapping.scope,
        unitIds: new Set(mapping.scope === 'UNITS' ? mapping.unitIds : []),
      });
      continue;
    }
    if (mapping.scope === 'WORKSPACE' || current.scope === 'WORKSPACE') {
      current.scope = 'WORKSPACE';
      current.unitIds.clear();
    } else {
      for (const unit of mapping.unitIds) current.unitIds.add(unit);
    }
  }
  return [...byRole.entries()]
    .map(([customRoleId, grant]) => ({
      customRoleId,
      scope: grant.scope,
      unitIds: sortedUnique([...grant.unitIds]),
    }))
    .sort((a, b) => a.customRoleId.localeCompare(b.customRoleId));
}

/** A directory-sourced assignment a member currently holds (only these are reconciled; manual grants are left alone). */
export interface HeldDirectoryAssignment {
  readonly assignmentId: string;
  readonly customRoleId: string;
  readonly scope: DirectoryGroupScope;
  readonly unitIds: readonly string[];
}

export interface DirectoryReconcilePlan {
  readonly toGrant: DesiredRoleGrant[];
  readonly toRevoke: readonly string[];
}

const sameGrant = (desired: DesiredRoleGrant, held: HeldDirectoryAssignment): boolean =>
  desired.customRoleId === held.customRoleId &&
  desired.scope === held.scope &&
  sortedUnique(desired.unitIds).join(',') === sortedUnique(held.unitIds).join(',');

/**
 * What to change so a member's directory-sourced assignments match the desired grants: grant the desired that are not
 * already held exactly, and revoke the held that are no longer desired (including a scope/unit change, which is a
 * revoke of the old plus a grant of the new).
 */
export function planDirectoryReconcile(
  desired: readonly DesiredRoleGrant[],
  held: readonly HeldDirectoryAssignment[],
): DirectoryReconcilePlan {
  const toGrant = desired.filter((want) => !held.some((have) => sameGrant(want, have)));
  const toRevoke = held
    .filter((have) => !desired.some((want) => sameGrant(want, have)))
    .map((have) => have.assignmentId);
  return { toGrant, toRevoke };
}
