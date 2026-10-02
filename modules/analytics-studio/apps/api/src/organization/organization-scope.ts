import {
  type OrganizationAccess,
  organizationAccess,
  organizationReadCondition,
  OrganizationReplica,
  OrganizationVersionPendingError,
} from '@gigalibs/module-sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import type { DatabaseService } from '../database/database.service.js';

/**
 * WI-OI-109e3 (ADR-0018 §3): which records a member may see by organization unit. Records carry the unit stamped at
 * build (`unit_id`), from a mapping field marked as the record's unit; no unit means tenant-shared (D3), a unit that
 * did not match is visible only with tenant-wide authority. Units expand from Analytics' own copy of the version the
 * context names; a version not held yet is refused (503), never answered more widely.
 */
export const organizationReplica = new OrganizationReplica('gigalibs_analytics');

/** Stamped on records whose unit value matched no unit: no member's units include it. */
export const UNMATCHED_UNIT = 'UNMATCHED';

/** The member's unit access, or null when no organization tree is in force. */
export async function resolveOrganizationAccess(db: DatabaseService, principal: AnalyticsPrincipal): Promise<OrganizationAccess | null> {
  if (!principal.organization) return null;
  const client = { query: (text: string, values?: unknown[]) => db.queryWithTenant(principal.tenantId, text, values as unknown[]) };
  try {
    return await organizationAccess(organizationReplica, client as never, principal.tenantId, principal.organization);
  } catch (error) {
    if (error instanceof OrganizationVersionPendingError) throw new ServiceUnavailableException({ code: error.code, message: error.message });
    throw error;
  }
}

/** SQL keeping records the member may see; `alias` is the record table's alias ('' for none). */
export function organizationScopeCondition(alias: string, access: OrganizationAccess, bind: (value: unknown) => string): string {
  return organizationReadCondition(access, `(${alias ? `${alias}.` : ''}analytical_payload->>'unit_id')`, bind) ?? 'TRUE';
}

/**
 * Whether answers for this dataset must be filtered by unit: a denied scope always is; otherwise only datasets whose
 * records carry units (the rest are entirely tenant-shared).
 */
export function organizationFilters(access: OrganizationAccess | null, fields: ReadonlyMap<string, unknown>): access is OrganizationAccess {
  return !!access && (access.denied || (access.readUnits !== null && fields.has('unit_id')));
}
