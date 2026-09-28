import { z } from 'zod';
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
  entitlement: PlatformContextEntitlementSchema,
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().min(1),
});
export type PlatformContextV1 = z.infer<typeof PlatformContextV1Schema>;
