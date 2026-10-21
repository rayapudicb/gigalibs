import { ForbiddenException } from '@nestjs/common';
import { scopeFor, type AssignmentCoverage, type ScopedPrincipal } from '@gigalibs/module-sdk';
import type { CmmsPrincipal } from './authorization.js';
import { type CmmsOrganizationTree, expandUnitRoots } from './organization-projection.js';
import { type CmmsPlaceTree, expandPlaceRoots } from './place-projection.js';

export interface CmmsScopeOptions {
  readonly shared?: boolean;
  /** WI-OI-120bu (F1): required when the principal carries assignment claims. */
  readonly permission?: string;
}

/**
 * WI-OI-120be (W1 review A, M1): the units a UNITS principal covers when no unit tree is passed (no production caller
 * passes one yet). Sign-in pairs UNITS with a department list that is the closure of the granted units
 * (`resolveUnitRootsScope`: read and write roots are the same units), so it carries their child units; the raw roots
 * alone would drop them. A list that overflowed is empty and so still fails closed.
 */
function unitsWithoutTree(principal: CmmsPrincipal, roots: readonly string[]): string[] {
  return principal.departmentScope.mode === 'DEPARTMENTS' ? [...principal.departmentScope.departmentIds] : [...roots];
}

function asScopedPrincipal(principal: CmmsPrincipal): ScopedPrincipal {
  return {
    permissions: principal.permissions,
    organization: principal.organization,
    placeScope: principal.placeScope,
    departmentScope: principal.departmentScope,
    assignments: principal.assignments,
  };
}

function inUnitsSql(alias: string, position: number, shared: boolean): string {
  return shared
    ? `(${alias}department_id IS NULL OR ${alias}department_id = ANY($${position}::text[]))`
    : `${alias}department_id = ANY($${position}::text[])`;
}

function legacyScopePredicates(
  principal: CmmsPrincipal,
  values: unknown[],
  alias: string,
  tree: CmmsOrganizationTree | undefined,
  placeTree: CmmsPlaceTree | undefined,
  shared: boolean,
): string[] {
  if (principal.organization?.mode === 'DENIED') {
    return ['FALSE'];
  }

  const predicates: string[] = [];

  if (principal.organization?.mode === 'UNITS') {
    const rawRoots = principal.organization.read_roots;
    let effectiveUnits: string[];
    if (tree) {
      effectiveUnits = expandUnitRoots(tree, rawRoots);
      if (principal.departmentScope.mode === 'DEPARTMENTS') {
        const deptSet = new Set(principal.departmentScope.departmentIds);
        effectiveUnits = effectiveUnits.filter((u) => deptSet.has(u));
      }
    } else {
      effectiveUnits = unitsWithoutTree(principal, rawRoots);
    }
    if (effectiveUnits.length === 0) return ['FALSE'];
    values.push(effectiveUnits);
    predicates.push(inUnitsSql(alias, values.length, shared));
  } else if (principal.departmentScope.mode === 'DEPARTMENTS') {
    if (principal.departmentScope.departmentIds.length === 0) return ['FALSE'];
    values.push([...principal.departmentScope.departmentIds]);
    predicates.push(inUnitsSql(alias, values.length, shared));
  }

  if (principal.placeScope.mode === 'PLACES') {
    const rawPlaces = principal.placeScope.placeIds;
    const expandedPlaces = placeTree ? expandPlaceRoots(placeTree, rawPlaces) : [...rawPlaces];
    if (expandedPlaces.length === 0) return ['FALSE'];
    values.push(expandedPlaces);
    predicates.push(`${alias}site_ref = ANY($${values.length}::uuid[])`);
  }
  return predicates;
}

function memberReadPredicate(
  member: Extract<AssignmentCoverage, { kind: 'MEMBER' }>,
  values: unknown[],
  alias: string,
  tree: CmmsOrganizationTree | undefined,
  placeTree: CmmsPlaceTree | undefined,
  shared: boolean,
): string | 'FALSE' | null {
  const org = member.organization;
  const parts: string[] = [];
  if (org.mode === 'DENIED') return 'FALSE';
  if (org.mode === 'UNITS') {
    let effectiveUnits = tree ? expandUnitRoots(tree, org.read_roots) : [...org.read_roots];
    if (member.departments.mode === 'DEPARTMENTS') {
      const deptSet = new Set(member.departments.departmentIds);
      effectiveUnits = effectiveUnits.filter((u) => deptSet.has(u));
    }
    if (effectiveUnits.length === 0) return 'FALSE';
    values.push(effectiveUnits);
    parts.push(inUnitsSql(alias, values.length, shared));
  } else if (member.departments.mode === 'DEPARTMENTS') {
    if (member.departments.departmentIds.length === 0) return 'FALSE';
    values.push([...member.departments.departmentIds]);
    parts.push(inUnitsSql(alias, values.length, shared));
  }
  if (member.places.mode === 'PLACES') {
    const expandedPlaces = placeTree ? expandPlaceRoots(placeTree, member.places.placeIds) : [...member.places.placeIds];
    if (expandedPlaces.length === 0) return 'FALSE';
    values.push(expandedPlaces);
    parts.push(`${alias}site_ref = ANY($${values.length}::uuid[])`);
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `(${parts.join(' AND ')})`;
}

function assignmentScopePredicates(
  principal: CmmsPrincipal,
  permission: string,
  values: unknown[],
  alias: string,
  tree: CmmsOrganizationTree | undefined,
  placeTree: CmmsPlaceTree | undefined,
  shared: boolean,
): string[] {
  const { coverage } = scopeFor(asScopedPrincipal(principal), permission);
  if (coverage.length === 0) return ['FALSE'];
  if (coverage.some((entry) => entry.kind === 'TENANT')) {
    return legacyScopePredicates(
      { ...principal, organization: { mode: 'TENANT' }, departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' } },
      values,
      alias,
      tree,
      placeTree,
      shared,
    );
  }

  const branches: string[] = [];
  for (const entry of coverage) {
    if (entry.kind === 'TENANT') continue;
    if (entry.kind === 'MEMBER') {
      const branch = memberReadPredicate(entry, values, alias, tree, placeTree, shared);
      if (branch === null) return [];
      if (branch === 'FALSE') continue;
      branches.push(branch);
      continue;
    }
    if (entry.kind === 'UNITS') {
      const effectiveUnits = tree ? expandUnitRoots(tree, entry.unitIds) : [...entry.unitIds];
      if (effectiveUnits.length === 0) continue;
      values.push(effectiveUnits);
      branches.push(inUnitsSql(alias, values.length, shared));
      continue;
    }
    if (entry.kind === 'PLACES') {
      const expandedPlaces = placeTree ? expandPlaceRoots(placeTree, entry.placeIds) : [...entry.placeIds];
      if (expandedPlaces.length === 0) continue;
      values.push(expandedPlaces);
      branches.push(`${alias}site_ref = ANY($${values.length}::uuid[])`);
    }
  }
  if (branches.length === 0) return ['FALSE'];
  if (branches.length === 1) return [branches[0]!];
  return [`(${branches.join(' OR ')})`];
}

/**
 * Read predicates for the caller's department, organization unit, and place scope, appended to `values` as bound parameters.
 * WI-OI-120bu (F1): when assignment claims are present, pass `permission` so scope follows the assignments that grant it.
 */
export function scopePredicates(
  principal: CmmsPrincipal,
  values: unknown[],
  alias = '',
  tree?: CmmsOrganizationTree,
  placeTree?: CmmsPlaceTree,
  { shared = true, permission }: CmmsScopeOptions = {},
): string[] {
  if (principal.assignments?.length && permission) {
    return assignmentScopePredicates(principal, permission, values, alias, tree, placeTree, shared);
  }
  return legacyScopePredicates(principal, values, alias, tree, placeTree, shared);
}

function coverageAllowsWrite(
  coverage: readonly AssignmentCoverage[],
  target: { readonly departmentId: string | null; readonly siteRef: string | null },
  tree: CmmsOrganizationTree | undefined,
  placeTree: CmmsPlaceTree | undefined,
): boolean {
  for (const entry of coverage) {
    if (entry.kind === 'TENANT') return true;
    if (entry.kind === 'MEMBER') {
      try {
        legacyAssertWritableScope(
          {
            organization: entry.organization,
            departmentScope: entry.departments,
            placeScope: entry.places,
          },
          target,
          tree,
          placeTree,
        );
        return true;
      } catch {
        continue;
      }
    }
    if (entry.kind === 'UNITS') {
      if (target.departmentId === null) continue;
      const expanded = tree ? expandUnitRoots(tree, entry.unitIds) : [...entry.unitIds];
      if (expanded.includes(target.departmentId)) return true;
      continue;
    }
    if (entry.kind === 'PLACES') {
      if (target.siteRef === null) continue;
      const expanded = placeTree ? expandPlaceRoots(placeTree, entry.placeIds) : [...entry.placeIds];
      if (expanded.includes(target.siteRef)) return true;
    }
  }
  return false;
}

function legacyAssertWritableScope(
  principal: Pick<CmmsPrincipal, 'organization' | 'departmentScope' | 'placeScope'>,
  target: { readonly departmentId: string | null; readonly siteRef: string | null },
  tree?: CmmsOrganizationTree,
  placeTree?: CmmsPlaceTree,
): void {
  if (principal.organization?.mode === 'DENIED') {
    throw new ForbiddenException({
      code: 'CMMS_OUT_OF_SCOPE',
      message: 'Organization scope denied.',
    });
  }

  if (principal.organization?.mode === 'UNITS') {
    if (target.departmentId === null) {
      throw new ForbiddenException({
        code: 'CMMS_OUT_OF_SCOPE',
        message: 'Changing tenant-shared records needs tenant-wide authority.',
      });
    }
    const rawRoots = principal.organization.write_roots;
    const expandedUnits = tree ? expandUnitRoots(tree, rawRoots) : unitsWithoutTree(principal as CmmsPrincipal, rawRoots);
    if (!expandedUnits.includes(target.departmentId)) {
      throw new ForbiddenException({
        code: 'CMMS_OUT_OF_SCOPE',
        message: 'The record belongs to a department outside your write access.',
      });
    }
    if (
      principal.departmentScope.mode === 'DEPARTMENTS' &&
      !principal.departmentScope.departmentIds.includes(target.departmentId)
    ) {
      throw new ForbiddenException({
        code: 'CMMS_OUT_OF_SCOPE',
        message: 'The record must belong to one of your departments.',
      });
    }
  } else if (
    principal.departmentScope.mode === 'DEPARTMENTS' &&
    (target.departmentId === null || !principal.departmentScope.departmentIds.includes(target.departmentId))
  ) {
    throw new ForbiddenException({
      code: 'CMMS_OUT_OF_SCOPE',
      message: 'The record must belong to one of your departments.',
    });
  }

  if (principal.placeScope.mode === 'PLACES') {
    if (target.siteRef === null) {
      throw new ForbiddenException({ code: 'CMMS_OUT_OF_SCOPE', message: 'The record must belong to one of your places.' });
    }
    const rawPlaces = principal.placeScope.placeIds;
    const expandedPlaces = placeTree ? expandPlaceRoots(placeTree, rawPlaces) : [...rawPlaces];
    if (!expandedPlaces.includes(target.siteRef)) {
      throw new ForbiddenException({ code: 'CMMS_OUT_OF_SCOPE', message: 'The record belongs to a place outside your access.' });
    }
  }
}

/**
 * Writes by a scoped member must land inside their scope: an organization/department-scoped member must name one of their
 * authorized departments/units (they cannot create or change tenant-wide records), and a place-scoped member one of their places.
 */
export function assertWritableScope(
  principal: CmmsPrincipal,
  target: { readonly departmentId: string | null; readonly siteRef: string | null },
  tree?: CmmsOrganizationTree,
  placeTree?: CmmsPlaceTree,
  { permission }: CmmsScopeOptions = {},
): void {
  if (principal.assignments?.length && permission) {
    const { coverage } = scopeFor(asScopedPrincipal(principal), permission);
    if (!coverageAllowsWrite(coverage, target, tree, placeTree)) {
      throw new ForbiddenException({
        code: 'CMMS_OUT_OF_SCOPE',
        message: 'The record is outside the scope of your role assignment.',
      });
    }
    return;
  }
  legacyAssertWritableScope(principal, target, tree, placeTree);
}

/**
 * WI-OI-120be (owner decision D3a, W1 review A M2): shared reference data (failure codes, job plans, classifications
 * and specification definitions) applies to every unit and site, so only members with workspace-wide access change it.
 */
export function assertWorkspaceWide(principal: CmmsPrincipal): void {
  const scoped =
    principal.organization?.mode === 'DENIED' ||
    principal.organization?.mode === 'UNITS' ||
    principal.departmentScope.mode === 'DEPARTMENTS' ||
    principal.placeScope.mode === 'PLACES';
  if (scoped) {
    throw new ForbiddenException({
      code: 'CMMS_OUT_OF_SCOPE',
      message: 'Shared reference data is changed with workspace-wide access only.',
    });
  }
}
