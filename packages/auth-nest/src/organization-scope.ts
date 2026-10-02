import { MAX_ORG_GRANTS_PER_MEMBER, type OrganizationScopeV2 } from '@gigalibs/contracts';
import type { prisma } from '@gigalibs/db';

// WI-OI-109e1 (ADR-0018 §3): a member's organization scope, resolved on the server whenever a session or a job
// subject is assembled. A tenant follows its organization once its primary tree has a version in force (owner
// decision 2026-10-01); until then the department scope applies unchanged.

type Reader = Pick<typeof prisma, '$queryRaw'>;

/** The legacy `org_scope` field lists unit ids directly; past this many it fails closed (empty list). */
export const LEGACY_DEPARTMENT_SCOPE_LIMIT = 1_000;

export type LegacyOrgScope = { mode: 'FLAT_TENANT' } | { mode: 'SCOPED_DEPARTMENTS'; departmentIds: string[] };

export interface TreeScope {
  /** Today's department-shaped field, kept for modules that have not moved to `organizationScope` yet. */
  orgScope: LegacyOrgScope;
  /** Signed as the `organization` claim. */
  organizationScope: OrganizationScopeV2;
  /** The read-write units exceeded the legacy limit, so the legacy field was emptied (fail closed). */
  legacyOverflow: boolean;
}

/** The primary tree's version in force at `at`, or null when the tenant has not activated one. */
export async function primaryVersionInForce(db: Reader, tenantId: string, at: Date = new Date()): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ versionId: string }>>`
    SELECT a."versionId" FROM org_hierarchy_activations a
      JOIN org_trees t ON t."tenantId" = a."tenantId" AND t.id = a."treeId"
     WHERE a."tenantId" = ${tenantId} AND t.kind = 'PRIMARY' AND a."effectiveFrom" <= ${at}
     ORDER BY a."effectiveFrom" DESC
     LIMIT 1`;
  return rows[0]?.versionId ?? null;
}

/**
 * Tenant-wide roles see the whole tenant. Everyone else holds the units they are granted now (placed in the version in
 * force and active: a grant on an inactive unit is paused) as roots; the roots cover everything below them, expanded by
 * modules from their own copy of that version. The legacy field is
 * derived from read-write grants only, so a read-only grant never unlocks a write through a module that still reads
 * department ids.
 */
export async function resolveTreeScope(
  db: Reader,
  input: { tenantId: string; userId: string; versionId: string; tenantWide: boolean; at?: Date },
): Promise<TreeScope> {
  if (input.tenantWide)
    return { orgScope: { mode: 'FLAT_TENANT' }, organizationScope: { mode: 'TENANT', tree_version: input.versionId }, legacyOverflow: false };
  const at = input.at ?? new Date();
  const roots = await db.$queryRaw<Array<{ unitId: string; write: boolean }>>`
    SELECT g."unitId", bool_or(g.access = 'READ_WRITE') AS write
      FROM org_scope_grants g
      JOIN org_hierarchy_edges e ON e."tenantId" = g."tenantId" AND e."versionId" = ${input.versionId} AND e."unitId" = g."unitId"
      JOIN org_units u ON u."tenantId" = g."tenantId" AND u.id = g."unitId" AND u.status = 'ACTIVE'
     WHERE g."tenantId" = ${input.tenantId} AND g."userId" = ${input.userId}
       AND g."revokedAt" IS NULL AND g."effectiveFrom" <= ${at} AND (g."effectiveTo" IS NULL OR g."effectiveTo" > ${at})
     GROUP BY g."unitId"
     ORDER BY g."unitId"
     LIMIT ${MAX_ORG_GRANTS_PER_MEMBER}`;
  const readRoots = roots.map((root) => root.unitId);
  const writeRoots = roots.filter((root) => root.write).map((root) => root.unitId);
  let departmentIds: string[] = [];
  let legacyOverflow = false;
  if (writeRoots.length > 0) {
    const covered = await db.$queryRaw<Array<{ unitId: string }>>`
      SELECT DISTINCT c."descendantUnitId" AS "unitId" FROM org_hierarchy_closure c
       WHERE c."tenantId" = ${input.tenantId} AND c."versionId" = ${input.versionId} AND c."ancestorUnitId" = ANY(${writeRoots}::text[])
       ORDER BY 1
       LIMIT ${LEGACY_DEPARTMENT_SCOPE_LIMIT + 1}`;
    legacyOverflow = covered.length > LEGACY_DEPARTMENT_SCOPE_LIMIT;
    departmentIds = legacyOverflow ? [] : covered.map((row) => row.unitId);
  }
  return {
    orgScope: { mode: 'SCOPED_DEPARTMENTS', departmentIds },
    organizationScope: { mode: 'UNITS', tree_version: input.versionId, read_roots: readRoots, write_roots: writeRoots },
    legacyOverflow,
  };
}
