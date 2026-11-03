import {
  OrganizationReplica,
  OrganizationScopeRefusal,
  assertOrganizationWrite,
  assertOwningUnit,
  organizationAccess,
  organizationReadCondition,
  type OrganizationAccess,
} from '@gigalibs/module-sdk';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';

// WI-OI-120ho (R5): a person (workforce_resources) carries no unit or site of their own, so a scoped caller sees a
// person only through where that person is assigned — an engagement on a position in one of the caller's units and
// at one of their places, or a booking on a work requirement in one of their units and at one of their places.
// Unassigned people are visible only to an unbounded caller (an administrator), which is intended.
// WI-OI-167: work requirements carry an owning unit, so the booking path covers units as well as places, and the
// helpers below scope requirements, bookings, candidates and time by both dimensions.

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

/** Whether the member is limited by organization unit (their context carries a unit claim that is not workspace-wide). */
export function limitedByUnit(principal: GigaOpsPrincipal): boolean {
  return principal.organization !== undefined && principal.organization.mode !== 'TENANT';
}

/** Refuses another person outside the caller's scope; one's own person always passes. */
export async function assertOtherPersonInScope(
  client: PoolClient,
  principal: GigaOpsPrincipal,
  resourceId: string,
  platformUserId: string | null,
): Promise<void> {
  if (platformUserId !== null && platformUserId === principal.subject) return;
  await assertPersonInScope(client, principal, resourceId);
}

/** The member's organization access in Workforce, or null when the context carries no organization claim. */
export async function workforceOrganizationAccess(client: PoolClient, principal: GigaOpsPrincipal): Promise<OrganizationAccess | null> {
  return principal.organization ? organizationAccess(replica, client, principal.tenantId, principal.organization) : null;
}

/** The units a member is limited to, or null when they are not limited by unit (an empty list when denied). */
function limitedUnits(access: OrganizationAccess | null): readonly string[] | null {
  if (!access) return null;
  if (access.denied) return [];
  return access.readUnits;
}

/**
 * The full scope-by-assignment predicate for a scoped caller, over both dimensions: unit (the position's
 * `department_id`, expanded through the organization replica, or the requirement's owning unit for a booking) and
 * place (`site_ref`). Returns the SQL clause, or `null` when the caller is unbounded on both (no filter).
 * `push(value)` binds a parameter and returns its `$n`.
 */
export async function peopleScopeClause(
  client: PoolClient,
  principal: GigaOpsPrincipal,
  push: (value: unknown) => string,
  personId = 'r.id',
  tenant = 'r.tenant_id',
): Promise<string | null> {
  const scopedPlaces = principal.spatialScope.mode === 'SCOPED_PLACES';
  const access = await workforceOrganizationAccess(client, principal);
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

  // A booking makes a person the caller's when its requirement is in the caller's units (owned by one, never shared)
  // and at the caller's places, for each dimension the caller is limited by.
  const units = limitedUnits(access);
  const requirementPredicates: string[] = [];
  if (units !== null) requirementPredicates.push(units.length > 0 ? `wr.organization_unit_id = ANY(${push([...units])}::text[])` : 'FALSE');
  if (scopedPlaces) requirementPredicates.push(`wr.site_ref = ANY(${push([...principal.spatialScope.place_ids])}::uuid[])`);
  const booking = `EXISTS (
      SELECT 1 FROM gigalibs_workforce.bookings b
        JOIN gigalibs_workforce.work_requirements wr ON wr.tenant_id = b.tenant_id AND wr.id = b.requirement_id
       WHERE b.tenant_id = ${tenant} AND b.resource_id = ${personId} AND b.status <> 'CANCELLED'
         AND ${requirementPredicates.join(' AND ')})`;

  return `(${engagement} OR ${booking})`;
}

/**
 * The unit dimension only, for records that are already limited by place on their own lines (time): the person is
 * engaged on a position in the caller's units, or booked on a requirement those units own. Null when the caller is
 * not limited by unit.
 */
export async function peopleUnitClause(
  client: PoolClient,
  principal: GigaOpsPrincipal,
  push: (value: unknown) => string,
  personId: string,
  tenant: string,
): Promise<string | null> {
  const units = limitedUnits(await workforceOrganizationAccess(client, principal));
  if (units === null) return null;
  if (units.length === 0) return 'FALSE';
  const param = push([...units]);
  return `(EXISTS (
      SELECT 1 FROM gigalibs_workforce.engagements e
        JOIN gigalibs_workforce.positions p ON p.tenant_id = e.tenant_id AND p.id = e.position_id
       WHERE e.tenant_id = ${tenant} AND e.resource_id = ${personId} AND e.status <> 'CANCELLED'
         AND p.department_id = ANY(${param}::text[])
    ) OR EXISTS (
      SELECT 1 FROM gigalibs_workforce.bookings b
        JOIN gigalibs_workforce.work_requirements wr ON wr.tenant_id = b.tenant_id AND wr.id = b.requirement_id
       WHERE b.tenant_id = ${tenant} AND b.resource_id = ${personId} AND b.status <> 'CANCELLED'
         AND wr.organization_unit_id = ANY(${param}::text[])
    ))`;
}

/**
 * Requirements (and bookings through their requirement) a member may read: at their places and, when limited by unit,
 * owned by one of their units or shared (ADR-0018 D3: shared records are readable by everyone).
 */
export async function requirementScopePredicates(
  client: PoolClient,
  principal: GigaOpsPrincipal,
  push: (value: unknown) => string,
  alias = 'r.',
): Promise<string[]> {
  const predicates: string[] = [];
  if (principal.spatialScope.mode === 'SCOPED_PLACES') predicates.push(`${alias}site_ref = ANY(${push([...principal.spatialScope.place_ids])}::uuid[])`);
  const access = await workforceOrganizationAccess(client, principal);
  const unit = access ? organizationReadCondition(access, `${alias}organization_unit_id`, push) : null;
  if (unit) predicates.push(unit);
  return predicates;
}

/** Workforce's answer to an organization refusal: out of scope is 403, an unusable unit is 400. */
export function workforceScopeRefusal(error: unknown): never {
  if (error instanceof OrganizationScopeRefusal) {
    if (error.code === 'ORGANIZATION_OUT_OF_SCOPE' || error.code === 'ORGANIZATION_SHARED_NEEDS_TENANT')
      throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: error.message });
    throw new BadRequestException({ code: 'WORKFORCE_VALIDATION_FAILED', message: error.message });
  }
  throw error;
}

/**
 * The unit a new requirement belongs to: the one named, or — for a member limited to exactly one unit — that unit;
 * otherwise none (shared). Refuses a unit outside the member's write access, a unit not in the version in force, and
 * shared demand created by a member limited by unit.
 */
export async function requirementOwner(client: PoolClient, principal: GigaOpsPrincipal, named: string | null | undefined): Promise<string | null> {
  const claim = principal.organization;
  const unitId = named ?? (claim?.mode === 'UNITS' && claim.write_roots.length === 1 ? claim.write_roots[0]! : null);
  const access = await workforceOrganizationAccess(client, principal);
  if (!access) return unitId;
  try {
    assertOrganizationWrite(access, unitId);
    await assertOwningUnit(replica, client, principal.tenantId, access, 'EITHER', unitId);
  } catch (error) {
    workforceScopeRefusal(error);
  }
  return unitId;
}

/** Refuses changing demand (or its bookings) owned by a unit outside the member's write access, or shared demand. */
export async function assertRequirementWrite(client: PoolClient, principal: GigaOpsPrincipal, unitId: string | null): Promise<void> {
  const access = await workforceOrganizationAccess(client, principal);
  if (!access) return;
  try {
    assertOrganizationWrite(access, unitId);
  } catch (error) {
    workforceScopeRefusal(error);
  }
}

/** Refuses a person outside the caller's scope (by assignment, over both dimensions). */
export async function assertPersonInScope(client: PoolClient, principal: GigaOpsPrincipal, resourceId: string): Promise<void> {
  const values: unknown[] = [principal.tenantId, resourceId];
  const clause = await peopleScopeClause(client, principal, (value) => {
    values.push(value);
    return `$${values.length}`;
  });
  if (clause === null) return;
  const found = await client.query(
    `SELECT 1 FROM gigalibs_workforce.workforce_resources r WHERE r.tenant_id = $1 AND r.id = $2 AND ${clause}`,
    values,
  );
  if (!found.rows[0]) throw new ForbiddenException({ code: 'WORKFORCE_OUT_OF_SCOPE', message: 'This person is not one of your people.' });
}
