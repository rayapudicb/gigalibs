import { z } from 'zod';
import { OrganizationScopeV2Schema } from '../organization/index.js';
import { SpatialScopePlaceIdsSchema } from '../geospatial/index.js';

export const PlatformContextPersonaSchema = z.enum([
  'PLATFORM_OPERATOR',
  'C_LEVEL',
  'TENANT_ADMIN',
  'OPERATIONS_SUPERVISOR',
  'WORKFORCE_MEMBER',
  'CUSTOMER_GUEST',
]);
export type PlatformContextPersona = z.infer<typeof PlatformContextPersonaSchema>;

export const PlatformContextOrgScopeSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('FLAT_TENANT'),
  }),
  z.object({
    mode: z.literal('SCOPED_DEPARTMENTS'),
    // An empty list is an intentional fail-closed scope for a hierarchy-enabled
    // member who has not yet been assigned to an organizational unit.
    department_ids: z.array(z.string().min(1)).max(1_000),
  }),
]);
export type PlatformContextOrgScope = z.infer<typeof PlatformContextOrgScopeSchema>;

export const PlatformContextSpatialScopeSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('UNBOUNDED'),
  }),
  z.object({
    mode: z.literal('SCOPED_PLACES'),
    // Place ids; each grants the place and everything inside it. An empty list is an intentional
    // fail-closed scope for a member of a spatially scoped tenant who has not been assigned any place.
    place_ids: SpatialScopePlaceIdsSchema,
  }),
]);
export type PlatformContextSpatialScope = z.infer<typeof PlatformContextSpatialScopeSchema>;

export const PlatformContextEntitlementSchema = z.object({
  module_key: z.string().min(1),
  status: z.literal('ENABLED'),
  version: z.string().default('v1'),
});
export type PlatformContextEntitlement = z.infer<typeof PlatformContextEntitlementSchema>;

export const PlatformContextV1Schema = z.object({
  iss: z.literal('gigalibs-control-plane'),
  aud: z.string().min(1),
  sub: z.string().min(1),
  tenant_id: z.string().min(1),
  session_id: z.string().min(1),
  auth_version: z.number().int().nonnegative(),
  roles: z.array(z.string()),
  granted_scopes: z.array(z.string()),
  persona_type: PlatformContextPersonaSchema,
  org_scope: PlatformContextOrgScopeSchema,
  /** Absent means UNBOUNDED, so tokens minted before spatial scoping keep their meaning. */
  spatial_scope: PlatformContextSpatialScopeSchema.optional(),
  /**
   * WI-OI-109e (ADR-0018 §3): the member's organization scope once the tenant's primary tree has a version in force.
   * Absent means the tenant is not organization-scoped yet and `org_scope` applies.
   */
  organization: OrganizationScopeV2Schema.optional(),
  entitlement: PlatformContextEntitlementSchema,
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().min(1),
});
export type PlatformContextV1 = z.infer<typeof PlatformContextV1Schema>;

/**
 * Pure, browser-safe persona resolution from tenant and platform role names (moved here from the web shell in
 * WI-OI-104c so the kernel worker and the web sign identical module contexts).
 */
export function determinePersona(
  roles: string[],
  platformRoles: string[],
): PlatformContextPersona {
  const upperPlatformRoles = new Set(platformRoles.map((r) => r.toUpperCase()));
  if (
    upperPlatformRoles.has('PLATFORM_OWNER') ||
    upperPlatformRoles.has('PLATFORM_ADMIN') ||
    upperPlatformRoles.has('PLATFORM_OPERATOR') ||
    upperPlatformRoles.has('PLATFORM_AUDITOR') ||
    upperPlatformRoles.has('PLATFORM_SUPPORT')
  ) {
    return 'PLATFORM_OPERATOR';
  }

  const upperRoles = new Set(roles.map((r) => r.toUpperCase()));
  if (
    upperRoles.has('OWNER') ||
    upperRoles.has('C_LEVEL') ||
    upperRoles.has('EXECUTIVE') ||
    upperRoles.has('CEO') ||
    upperRoles.has('CFO') ||
    upperRoles.has('CTO') ||
    upperRoles.has('COO')
  ) {
    return 'C_LEVEL';
  }

  if (
    upperRoles.has('SUPER_ADMIN') ||
    upperRoles.has('ADMIN') ||
    upperRoles.has('TENANT_ADMIN')
  ) {
    return 'TENANT_ADMIN';
  }

  if (
    upperRoles.has('SUPERVISOR') ||
    upperRoles.has('MANAGER') ||
    upperRoles.has('DISPATCHER') ||
    upperRoles.has('OPERATIONS_SUPERVISOR')
  ) {
    return 'OPERATIONS_SUPERVISOR';
  }

  if (
    upperRoles.has('WORKFORCE_MEMBER') ||
    upperRoles.has('MEMBER') ||
    upperRoles.has('WORKER') ||
    upperRoles.has('OPERATOR') ||
    upperRoles.has('TECHNICIAN')
  ) {
    return 'WORKFORCE_MEMBER';
  }

  return 'CUSTOMER_GUEST';
}
