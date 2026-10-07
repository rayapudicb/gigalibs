import { decodeAssignmentGrants, holdsPermission, type PlatformContextV1 } from '@gigalibs/contracts';
import type { OrganizationClaim } from './organization-access.js';

// WI-OI-120w (R2 slice 3, ADR-0034 §1 and §5): access is decided per role assignment, never by combining one
// assignment's permissions with another's scope. `scopeFor` is the one helper every module uses (its R5 card) to ask
// where a person may use a permission: a record is covered when any assignment that grants the permission covers it.

/** Spatial scope as the principal carries it (`ModulePlaceScope`). */
type PlaceScope = { readonly mode: 'ALL' } | { readonly mode: 'PLACES'; readonly placeIds: readonly string[] };
/** Legacy department scope as the principal carries it (`ModuleDepartmentScope`). */
type DepartmentScope = { readonly mode: 'ALL' } | { readonly mode: 'DEPARTMENTS'; readonly departmentIds: readonly string[] };

/** Where one assignment applies, in module terms. */
export type AssignmentCoverage =
  /**
   * The member's own scope: their organization claim, their places and, for modules still on departments, their
   * departments, exactly as every module reads them today (Security review of slice 3, L2: departments kept).
   */
  | {
      readonly kind: 'MEMBER';
      readonly organization: OrganizationClaim;
      readonly places: PlaceScope;
      readonly departments: DepartmentScope;
    }
  /** The whole workspace. */
  | { readonly kind: 'TENANT' }
  /** These units and everything below them in the named tree version. */
  | { readonly kind: 'UNITS'; readonly treeVersion: string; readonly unitIds: readonly string[] }
  /** These places and everything inside them. */
  | { readonly kind: 'PLACES'; readonly placeIds: readonly string[] };

/** One role assignment: its own permissions and where they apply. */
export interface ModuleAssignment {
  readonly permissions: readonly string[];
  readonly coverage: AssignmentCoverage;
}

/** Where a person may use one permission. */
export interface PermissionScope {
  readonly permission: string;
  /** A record is covered when any entry covers it. Empty: the person may not use the permission anywhere. */
  readonly coverage: readonly AssignmentCoverage[];
}

/** The minimum of a principal `scopeFor` reads. */
export interface ScopedPrincipal {
  readonly permissions: readonly string[];
  readonly organization?: OrganizationClaim;
  readonly placeScope: PlaceScope;
  readonly departmentScope: DepartmentScope;
  readonly assignments?: readonly ModuleAssignment[];
}

/**
 * Where `principal` may use `permission`: the coverage of each assignment that grants it. Without an assignment claim
 * (a context minted before it), a held permission applies at the member's own scope, as it always has.
 */
export function scopeFor(principal: ScopedPrincipal, permission: string): PermissionScope {
  if (!principal.assignments) {
    return Object.freeze({
      permission,
      coverage: Object.freeze(
        holdsPermission(principal.permissions, permission) ? [memberCoverage(principal.organization, principal.placeScope, principal.departmentScope)] : [],
      ),
    });
  }
  const coverage: AssignmentCoverage[] = [];
  let member = false;
  for (const assignment of principal.assignments) {
    if (!holdsPermission(assignment.permissions, permission)) continue;
    if (assignment.coverage.kind === 'MEMBER') {
      // Every `MEMBER` assignment covers the same scope; list it once.
      if (member) continue;
      member = true;
    }
    coverage.push(assignment.coverage);
  }
  return Object.freeze({ permission, coverage: Object.freeze(coverage) });
}

/** The assignments a verified context carries, decoded against its `granted_scopes`; undefined when it has none. */
export function assignmentsFromContext(
  context: PlatformContextV1,
  organization: OrganizationClaim,
  places: PlaceScope,
  departments: DepartmentScope,
): readonly ModuleAssignment[] | undefined {
  if (!context.assignments) return undefined;
  return Object.freeze(
    context.assignments.items.map((item) =>
      Object.freeze({
        permissions: Object.freeze(decodeAssignmentGrants(context.granted_scopes, item.grants)),
        coverage: coverageFromClaim(item.scope, organization, places, departments),
      }),
    ),
  );
}

function coverageFromClaim(
  scope: NonNullable<PlatformContextV1['assignments']>['items'][number]['scope'],
  organization: OrganizationClaim,
  places: PlaceScope,
  departments: DepartmentScope,
): AssignmentCoverage {
  // An absent scope is `MEMBER`, the default the control plane leaves out.
  if (scope?.kind === 'UNITS') return Object.freeze({ kind: 'UNITS', treeVersion: scope.tree_version, unitIds: Object.freeze([...scope.unit_ids]) });
  if (scope?.kind === 'PLACES') return Object.freeze({ kind: 'PLACES', placeIds: Object.freeze([...scope.place_ids]) });
  if (scope?.kind === 'TENANT') return Object.freeze({ kind: 'TENANT' });
  return memberCoverage(organization, places, departments);
}

function memberCoverage(organization: OrganizationClaim | undefined, places: PlaceScope, departments: DepartmentScope): AssignmentCoverage {
  return Object.freeze({ kind: 'MEMBER', organization: organization ?? Object.freeze({ mode: 'TENANT' as const }), places, departments });
}
