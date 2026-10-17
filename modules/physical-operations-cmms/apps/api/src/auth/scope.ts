import { ForbiddenException } from '@nestjs/common';
import type { CmmsPrincipal } from './authorization.js';
import { type CmmsOrganizationTree, expandUnitRoots } from './organization-projection.js';
import { type CmmsPlaceTree, expandPlaceRoots } from './place-projection.js';

/**
 * WI-OI-120be (W1 review A, M1): the units a UNITS principal covers when no unit tree is passed (no production caller
 * passes one yet). Sign-in pairs UNITS with a department list that is the closure of the granted units
 * (`resolveUnitRootsScope`: read and write roots are the same units), so it carries their child units; the raw roots
 * alone would drop them. A list that overflowed is empty and so still fails closed.
 */
function unitsWithoutTree(principal: CmmsPrincipal, roots: readonly string[]): string[] {
  // The closure includes the granted units themselves, so it is the whole set; units outside it were never in scope.
  return principal.departmentScope.mode === 'DEPARTMENTS' ? [...principal.departmentScope.departmentIds] : [...roots];
}

/**
 * Read predicates for the caller's department, organization unit, and place scope, appended to `values` as bound parameters.
 * `alias` qualifies the columns (e.g. `a.`). Department/unit scope keeps tenant-wide rows (department_id NULL)
 * visible; place scope is exact and excludes rows without a site, so a scoped member never sees more than their
 * places. An empty scope list or DENIED organization scope matches nothing, not even tenant-wide rows (fail-closed).
 * `shared: false` drops the tenant-wide rows too, for records that are private to their unit (maintenance requests).
 */
export function scopePredicates(
  principal: CmmsPrincipal,
  values: unknown[],
  alias = '',
  tree?: CmmsOrganizationTree,
  placeTree?: CmmsPlaceTree,
  { shared = true }: { readonly shared?: boolean } = {},
): string[] {
  if (principal.organization?.mode === 'DENIED') {
    return ['FALSE'];
  }

  const predicates: string[] = [];
  const inUnits = (position: number) =>
    shared
      ? `(${alias}department_id IS NULL OR ${alias}department_id = ANY($${position}::text[]))`
      : `${alias}department_id = ANY($${position}::text[])`;

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
    predicates.push(inUnits(values.length));
  } else if (principal.departmentScope.mode === 'DEPARTMENTS') {
    if (principal.departmentScope.departmentIds.length === 0) return ['FALSE'];
    values.push([...principal.departmentScope.departmentIds]);
    predicates.push(inUnits(values.length));
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

/**
 * Writes by a scoped member must land inside their scope: an organization/department-scoped member must name one of their
 * authorized departments/units (they cannot create or change tenant-wide records), and a place-scoped member one of their places.
 */
export function assertWritableScope(
  principal: CmmsPrincipal,
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
    const expandedUnits = tree ? expandUnitRoots(tree, rawRoots) : unitsWithoutTree(principal, rawRoots);
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
