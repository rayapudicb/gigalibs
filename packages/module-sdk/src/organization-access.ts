import type { OrganizationReplica, ReplicaClient } from './organization-replica.js';

// WI-OI-109e3 (ADR-0018 §2–§3): what a member may read and change in a module, from the signed `organization` claim
// and the module's own copy of the version it names. Every module applies the same rules: a record belongs to a unit
// or is tenant-shared (D3); shared records are readable by all and changed only with tenant-wide authority; a grant
// covers its unit and everything below it; a module never answers from a version it does not hold (fail closed).

/** `PlatformContextV1.organization`. */
export type OrganizationClaim =
  | { readonly mode: 'TENANT'; readonly tree_version?: string | undefined }
  | { readonly mode: 'UNITS'; readonly tree_version: string; readonly read_roots: readonly string[]; readonly write_roots: readonly string[] }
  | { readonly mode: 'DENIED' };

/** Who may own an entity's records (D3). */
export type OwnershipPolicy = 'UNIT' | 'SHARED' | 'EITHER';

export interface OrganizationAccess {
  /** Units whose records may be read; null means every unit (tenant-wide authority). */
  readonly readUnits: readonly string[] | null;
  /** Units whose records may be changed; null means every unit and shared records. */
  readonly writeUnits: readonly string[] | null;
  /** The version in force, when known; ownership is checked against it. */
  readonly versionId: string | null;
  readonly denied: boolean;
}

/** The context names a version this module does not hold yet; answer 503 and let the caller retry shortly. */
export class OrganizationVersionPendingError extends Error {
  readonly code = 'ORGANIZATION_VERSION_PENDING';
  constructor(readonly versionId: string) {
    super('This organization version is still being delivered here; try again in a moment.');
    this.name = 'OrganizationVersionPendingError';
  }
}

/** A change the member's organization access or the entity's ownership policy does not allow. */
export class OrganizationScopeRefusal extends Error {
  constructor(
    readonly code: 'ORGANIZATION_OUT_OF_SCOPE' | 'ORGANIZATION_SHARED_NEEDS_TENANT' | 'ORGANIZATION_OWNER_REQUIRED' | 'ORGANIZATION_SHARED_ONLY' | 'ORGANIZATION_NOT_A_RECORD_UNIT',
    message: string,
  ) {
    super(message);
    this.name = 'OrganizationScopeRefusal';
  }
}

export async function organizationAccess(
  replica: OrganizationReplica,
  client: ReplicaClient,
  tenantId: string,
  claim: OrganizationClaim,
): Promise<OrganizationAccess> {
  if (claim.mode === 'TENANT') {
    // A tenant-wide role has wider data authority, but it may not bypass version convergence. If the signed context
    // names a tree version, the module must hold that exact version before it answers (ADR-0018 §3).
    if (claim.tree_version && !(await replica.isReady(client, tenantId, claim.tree_version))) {
      throw new OrganizationVersionPendingError(claim.tree_version);
    }
    return { readUnits: null, writeUnits: null, versionId: claim.tree_version ?? null, denied: false };
  }
  if (claim.mode === 'DENIED') return { readUnits: [], writeUnits: [], versionId: null, denied: true };
  if (!(await replica.isReady(client, tenantId, claim.tree_version))) throw new OrganizationVersionPendingError(claim.tree_version);
  return {
    readUnits: await replica.expand(client, tenantId, claim.tree_version, claim.read_roots),
    writeUnits: await replica.expand(client, tenantId, claim.tree_version, claim.write_roots),
    versionId: claim.tree_version,
    denied: false,
  };
}

/** SQL keeping the records a member may read (their units' and shared ones); null when nothing needs filtering. */
export function organizationReadCondition(access: OrganizationAccess, column: string, bind: (value: unknown) => string): string | null {
  if (access.denied) return 'FALSE';
  if (access.readUnits === null) return null;
  return `(${column} IS NULL OR ${column} = ANY(${bind([...access.readUnits])}::text[]))`;
}

/** Refuses changing a record of a unit outside the member's read-write access, or a shared one without tenant-wide authority. */
export function assertOrganizationWrite(access: OrganizationAccess, unitId: string | null): void {
  if (access.writeUnits === null && !access.denied) return;
  if (unitId === null)
    throw new OrganizationScopeRefusal('ORGANIZATION_SHARED_NEEDS_TENANT', 'Changing tenant-shared records needs tenant-wide authority.');
  if (!access.writeUnits?.includes(unitId))
    throw new OrganizationScopeRefusal('ORGANIZATION_OUT_OF_SCOPE', 'The record belongs to a unit outside your access.');
}

/**
 * Refuses an owner the entity's policy does not allow, or a unit that is not in the version in force or whose type
 * only groups other units. A refused owner is never silently changed (unlike iDempiere's reset to Org 0).
 */
export async function assertOwningUnit(
  replica: OrganizationReplica,
  client: ReplicaClient,
  tenantId: string,
  access: OrganizationAccess,
  policy: OwnershipPolicy,
  unitId: string | null,
): Promise<void> {
  if (policy === 'UNIT' && unitId === null) throw new OrganizationScopeRefusal('ORGANIZATION_OWNER_REQUIRED', 'Choose the unit this record belongs to.');
  if (policy === 'SHARED' && unitId !== null) throw new OrganizationScopeRefusal('ORGANIZATION_SHARED_ONLY', 'These records are shared across the tenant and belong to no unit.');
  if (unitId === null || access.versionId === null) return;
  const unit = await replica.unit(client, tenantId, access.versionId, unitId);
  if (!unit) throw new OrganizationScopeRefusal('ORGANIZATION_NOT_A_RECORD_UNIT', 'That unit is not in the organization in force.');
  if (!unit.holds_records)
    throw new OrganizationScopeRefusal('ORGANIZATION_NOT_A_RECORD_UNIT', `A ${unit.type_code} groups other units and does not hold records; choose a unit below it.`);
}
