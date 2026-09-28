import { ForbiddenException } from '@nestjs/common';
import type { CmmsPrincipal } from './authorization.js';

/**
 * Read predicates for the caller's department and place scope, appended to `values` as bound parameters.
 * `alias` qualifies the columns (e.g. `a.`). Department scope keeps tenant-wide rows (department_id NULL)
 * visible; place scope is exact and excludes rows without a site, so a scoped member never sees more than their
 * places. An empty scope list matches nothing, not even tenant-wide rows (fail-closed).
 */
export function scopePredicates(principal: CmmsPrincipal, values: unknown[], alias = ''): string[] {
  const predicates: string[] = [];
  if (principal.departmentScope.mode === 'DEPARTMENTS') {
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
 * Writes by a scoped member must land inside their scope: a department-scoped member must name one of their
 * departments (they cannot create or change tenant-wide records), and a place-scoped member one of their places.
 */
export function assertWritableScope(
  principal: CmmsPrincipal,
  target: { readonly departmentId: string | null; readonly siteRef: string | null },
): void {
  if (
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
