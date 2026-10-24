import { OrganizationReplica, organizationAccess, organizationReadCondition } from '@gigalibs/module-sdk';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';

// WI-OI-120ho (R5): a person (workforce_resources) carries no unit or site of their own, so a scoped caller sees a
// person only through where that person is assigned — an engagement on a position in one of the caller's units and
// at one of their places, or a booking on a work requirement at one of their places. Unassigned people are visible
// only to an unbounded caller (an administrator), which is intended. The booking path is place-only (work
// requirements carry no unit). Flipping the SCOPE_ENFORCING_MODULES allow-list is tracked separately.

const replica = new OrganizationReplica('gigalibs_workforce');

/**
 * The place-only EXISTS predicate (engagement→position site, or booking→requirement site). `placesParam` is the bound
 * parameter holding the place ids (`uuid[]`). Kept as a building block; the full scope clause below adds units.
 */
export function peoplePlacesScopeByAssignment(placesParam: string, personId = 'r.id', tenant = 'r.tenant_id'): string {
  return `(EXISTS (
      SELECT 1 FROM gigalibs_workforce.engagements e
        JOIN gigalibs_workforce.positions p ON p.tenant_id = e.tenant_id AND p.id = e.position_id
       WHERE e.tenant_id = ${tenant} AND e.resource_id = ${personId} AND e.status <> 'CANCELLED'
         AND p.site_ref = ANY(${placesParam})
    ) OR EXISTS (
      SELECT 1 FROM gigalibs_workforce.bookings b
        JOIN gigalibs_workforce.work_requirements wr ON wr.tenant_id = b.tenant_id AND wr.id = b.requirement_id
       WHERE b.tenant_id = ${tenant} AND b.resource_id = ${personId} AND b.status <> 'CANCELLED'
         AND wr.site_ref = ANY(${placesParam})
    ))`;
}

/**
 * The full scope-by-assignment predicate for a scoped caller, over both dimensions: unit (the position's
 * `department_id`, expanded through the organization replica) and place (`site_ref`). Returns the SQL clause, or
 * `null` when the caller is unbounded on both (no filter). `push(value)` binds a parameter and returns its `$n`.
 */
export async function peopleScopeClause(
  client: PoolClient,
  principal: GigaOpsPrincipal,
  push: (value: unknown) => string,
  personId = 'r.id',
  tenant = 'r.tenant_id',
): Promise<string | null> {
  const scopedPlaces = principal.spatialScope.mode === 'SCOPED_PLACES';
  const access = principal.organization ? await organizationAccess(replica, client, principal.tenantId, principal.organization) : null;
  const unitCondition = access ? organizationReadCondition(access, 'p.department_id', push) : null;
  // Unbounded on both dimensions — nothing to filter.
  if (!scopedPlaces && !unitCondition) return null;

  const positionPredicates: string[] = [];
  if (unitCondition) positionPredicates.push(unitCondition);
  if (scopedPlaces) positionPredicates.push(`p.site_ref = ANY(${push([...principal.spatialScope.place_ids])}::uuid[])`);
  const positionWhere = positionPredicates.length > 0 ? ` AND ${positionPredicates.join(' AND ')}` : '';
  const engagement = `EXISTS (
      SELECT 1 FROM gigalibs_workforce.engagements e
        JOIN gigalibs_workforce.positions p ON p.tenant_id = e.tenant_id AND p.id = e.position_id
       WHERE e.tenant_id = ${tenant} AND e.resource_id = ${personId} AND e.status <> 'CANCELLED'${positionWhere})`;

  // The booking path is place-only (work requirements carry no unit); it applies only to a place-scoped caller.
  const booking = scopedPlaces
    ? `EXISTS (
      SELECT 1 FROM gigalibs_workforce.bookings b
        JOIN gigalibs_workforce.work_requirements wr ON wr.tenant_id = b.tenant_id AND wr.id = b.requirement_id
       WHERE b.tenant_id = ${tenant} AND b.resource_id = ${personId} AND b.status <> 'CANCELLED'
         AND wr.site_ref = ANY(${push([...principal.spatialScope.place_ids])}::uuid[]))`
    : null;

  return `(${[engagement, booking].filter(Boolean).join(' OR ')})`;
}
