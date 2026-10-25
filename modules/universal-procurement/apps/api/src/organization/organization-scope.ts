import {
  type ModulePrincipal,
  type OrganizationAccess,
  OrganizationReplica,
  OrganizationScopeRefusal,
  OrganizationVersionPendingError,
  assertOrganizationWrite,
  organizationAccess,
  organizationReadCondition,
} from '@gigalibs/module-sdk';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';

/**
 * WI-OI-120p slice 9 (R14, scope in every module): Procurement limits records by organization unit, the same way
 * Analytics and Workforce do. Records carry `org_unit_id`; a member sees and changes only their units' records (a
 * grant covers its unit and everything below it), tenant-wide authority sees and changes all, and a version the
 * context names must be delivered to Procurement first or the read fails closed (503). When no organization tree is in
 * force (`principal.organization` absent) nothing is filtered, so a workspace that has not switched on the hierarchy is
 * unaffected.
 */
export const organizationReplica = new OrganizationReplica(SCHEMA);

/** The member's unit access, or null when no organization tree is in force (then nothing is filtered). */
export async function resolveOrganizationAccess(
  client: PoolClient,
  principal: ModulePrincipal,
): Promise<OrganizationAccess | null> {
  if (!principal.organization) return null;
  try {
    return await organizationAccess(
      organizationReplica,
      client as never,
      principal.tenantId,
      principal.organization,
    );
  } catch (error) {
    if (error instanceof OrganizationVersionPendingError)
      throw new ServiceUnavailableException({ code: error.code, message: error.message });
    throw error;
  }
}

/** SQL keeping the records a member may read (their units' and tenant-shared ones); 'TRUE' when nothing needs filtering. */
export function orgReadCondition(
  access: OrganizationAccess | null,
  column: string,
  bind: (value: unknown) => string,
): string {
  if (!access) return 'TRUE';
  return organizationReadCondition(access, column, bind) ?? 'TRUE';
}

/** Whether the member may see a record owned by `orgUnitId` (null means tenant-shared, visible to everyone). */
export function canReadUnit(access: OrganizationAccess | null, orgUnitId: string | null): boolean {
  if (!access) return true;
  if (access.denied) return false;
  if (orgUnitId === null) return true;
  if (access.readUnits === null) return true;
  return access.readUnits.includes(orgUnitId);
}

/** Refuses changing a record of a unit outside the member's write access; a no-op when no tree is in force. */
export function assertWritableUnit(
  access: OrganizationAccess | null,
  orgUnitId: string | null,
): void {
  if (!access) return;
  try {
    assertOrganizationWrite(access, orgUnitId);
  } catch (error) {
    if (error instanceof OrganizationScopeRefusal)
      throw new ForbiddenException({ code: error.code, message: error.message });
    throw error;
  }
}
