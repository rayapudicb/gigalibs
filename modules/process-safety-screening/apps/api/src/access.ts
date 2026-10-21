import {
  type ModulePrincipal,
  type OrganizationAccess,
  OrganizationReplica,
  OrganizationScopeRefusal,
  OrganizationVersionPendingError,
  assertOrganizationWrite,
  assertOwningUnit,
  organizationAccess,
  organizationReadCondition,
} from '@gigalibs/module-sdk';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type pg from 'pg';
import { SCHEMA } from './config.js';

// WI-OI-120bw/120bx: SPEED's organization rules, shared by every record that belongs to a site (ADR-0018). A project
// belongs to one site; its routes, steps and materials belong to the project's site. A member reads the records of the
// units their access covers and changes those of the units they may write; a site must be a unit that holds records.

export type Client = pg.PoolClient;

const organization = new OrganizationReplica(SCHEMA);

/** The member's organization access; a version this module does not hold yet answers 503. */
export async function resolveAccess(
  client: Client,
  principal: ModulePrincipal,
): Promise<OrganizationAccess> {
  try {
    return await organizationAccess(
      organization,
      client,
      principal.tenantId,
      principal.organization ?? { mode: 'TENANT' },
    );
  } catch (error) {
    if (error instanceof OrganizationVersionPendingError)
      throw new ServiceUnavailableException({ code: error.code, message: error.message });
    throw error;
  }
}

/** SQL keeping the rows whose site the member may read, binding values into `values`; null when nothing is filtered. */
export function readableSite(
  access: OrganizationAccess,
  column: string,
  values: unknown[],
): string | null {
  return organizationReadCondition(access, column, (value) => {
    values.push(value);
    return `$${values.length}`;
  });
}

export function assertSiteWrite(access: OrganizationAccess, siteUnitId: string): void {
  try {
    assertOrganizationWrite(access, siteUnitId);
  } catch (error) {
    if (error instanceof OrganizationScopeRefusal)
      throw new ForbiddenException({ code: error.code, message: error.message });
    throw error;
  }
}

/** A site must be a unit that holds records in the organization in force, and one the member may write. */
export async function assertSite(
  client: Client,
  principal: ModulePrincipal,
  access: OrganizationAccess,
  siteUnitId: string,
): Promise<void> {
  try {
    await assertOwningUnit(organization, client, principal.tenantId, access, 'UNIT', siteUnitId);
  } catch (error) {
    if (error instanceof OrganizationScopeRefusal)
      throw new ForbiddenException({ code: error.code, message: error.message });
    throw error;
  }
  assertSiteWrite(access, siteUnitId);
}
