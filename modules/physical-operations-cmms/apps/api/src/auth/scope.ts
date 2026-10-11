import { ForbiddenException } from '@nestjs/common';
import type { CmmsPrincipal } from './authorization.js';
import { type CmmsOrganizationTree, expandUnitRoots } from './organization-projection.js';

/**
 * Read predicates for the caller's department, organization unit, and place scope, appended to `values` as bound parameters.
 * `alias` qualifies the columns (e.g. `a.`). Department/unit scope keeps tenant-wide rows (department_id NULL)
 * visible; place scope is exact and excludes rows without a site, so a scoped member never sees more than their
 * places. An empty scope list or DENIED organization scope matches nothing, not even tenant-wide rows (fail-closed).
 */
export function scopePredicates(
  principal: CmmsPrincipal,
  values: unknown[],
  alias = '',
  tree?: CmmsOrganizationTree,
): string[] {
  if (principal.organization?.mode === 'DENIED') {
    return ['FALSE'];
  }

  const predicates: string[] = [];

  if (principal.organization?.mode === 'UNITS') {
    const rawRoots = principal.organization.read_roots;
    const expandedUnits = tree ? expandUnitRoots(tree, rawRoots) : [...rawRoots];
    let effectiveUnits = expandedUnits;
    if (principal.departmentScope.mode === 'DEPARTMENTS') {
      const deptSet = new Set(principal.departmentScope.departmentIds);
      effectiveUnits = effectiveUnits.filter((u) => deptSet.has(u));
    }
    if (effectiveUnits.length === 0) return ['FALSE'];
    values.push(effectiveUnits);
    predicates.push(`(${alias}department_id IS NULL OR ${alias}department_id = ANY($${values.length}::text[]))`);
  } else if (principal.departmentScope.mode === 'DEPARTMENTS') {
    if (principal.departmentScope.departmentIds.length === 0) return ['FALSE'];
    values.push([...principal.departmentScope.departmentIds]);
    predicates.push(`(${alias}department_id IS NULL OR ${alias}department_id = ANY($${values.length}::text[]))`);
  }

  if (principal.placeScope.mode === 'PLACES') {
    values.push([...principal.placeScope.placeIds]);
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
    const expandedUnits = tree ? expandUnitRoots(tree, rawRoots) : [...rawRoots];
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

  if (
    principal.placeScope.mode === 'PLACES' &&
    (target.siteRef === null || !principal.placeScope.placeIds.includes(target.siteRef))
  ) {
    throw new ForbiddenException({ code: 'CMMS_OUT_OF_SCOPE', message: 'The record must belong to one of your places.' });
  }
}
