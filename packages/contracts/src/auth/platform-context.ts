import { z } from 'zod';
import { MAX_ORG_GRANTS_PER_MEMBER, OrganizationScopeV2Schema } from '../organization/index.js';
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

/** WI-OI-120w (R2 slice 3): a member holds at most this many live roles, so their signed context stays small. */
export const MAX_MEMBER_ROLE_ASSIGNMENTS = 30;
/** The base role (with the member's direct codes) travels as one more assignment beside the roles. */
export const MAX_CONTEXT_ASSIGNMENTS = MAX_MEMBER_ROLE_ASSIGNMENTS + 1;

const ContextIdSchema = z.string().min(1).max(64);

/**
 * WI-OI-120w (R2 slice 3, ADR-0034 §5): where one role assignment applies.
 * - `MEMBER`: the member's own scope, exactly the context's `organization` and `spatial_scope` claims. Every
 *   assignment has it until explicit scopes are switched on (slice 2b).
 * - `TENANT`: the whole workspace.
 * - `UNITS`: these units and everything below them in the named tree version.
 * - `PLACES`: these places and everything inside them.
 */
export const PlatformContextAssignmentScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MEMBER') }).strict(),
  z.object({ kind: z.literal('TENANT') }).strict(),
  z
    .object({
      kind: z.literal('UNITS'),
      tree_version: ContextIdSchema,
      unit_ids: z.array(ContextIdSchema).min(1).max(MAX_ORG_GRANTS_PER_MEMBER),
    })
    .strict(),
  z.object({ kind: z.literal('PLACES'), place_ids: SpatialScopePlaceIdsSchema.refine((ids) => ids.length > 0, 'At least one place.') }).strict(),
]);
export type PlatformContextAssignmentScope = z.infer<typeof PlatformContextAssignmentScopeSchema>;

/**
 * One assignment: which of the context's `granted_scopes` it grants, as a compact reference (a bitmap in hex; bit i,
 * lowest first in each byte, is `granted_scopes[i]`), and where it applies. Permissions are evaluated per assignment,
 * never across them (ADR-0034 §1).
 */
export const PlatformContextAssignmentSchema = z
  .object({
    grants: z.string().regex(/^(?:[0-9a-f]{2})*$/).max(2_048),
    scope: PlatformContextAssignmentScopeSchema,
  })
  .strict();
export type PlatformContextAssignment = z.infer<typeof PlatformContextAssignmentSchema>;

export const PlatformContextAssignmentsSchema = z
  .object({ version: z.literal(1), items: z.array(PlatformContextAssignmentSchema).max(MAX_CONTEXT_ASSIGNMENTS) })
  .strict();

/** The hex bitmap of which `grantedScopes` an assignment's `permissions` are; a code not among them is left out. */
export function encodeAssignmentGrants(grantedScopes: readonly string[], permissions: readonly string[]): string {
  const held = new Set(permissions);
  const bytes = new Array<number>(Math.ceil(grantedScopes.length / 8)).fill(0);
  grantedScopes.forEach((code, index) => {
    if (held.has(code)) bytes[index >> 3]! |= 1 << (index & 7);
  });
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The permissions an assignment's bitmap names. A bitmap of the wrong length, or with bits past the end, is refused. */
export function decodeAssignmentGrants(grantedScopes: readonly string[], grants: string): string[] {
  if (!assignmentGrantsFit(grantedScopes.length, grants)) throw new Error('An assignment names permissions the context does not hold.');
  const permissions: string[] = [];
  grantedScopes.forEach((code, index) => {
    if ((Number.parseInt(grants.slice((index >> 3) * 2, (index >> 3) * 2 + 2), 16) >> (index & 7)) & 1) permissions.push(code);
  });
  return permissions;
}

function assignmentGrantsFit(count: number, grants: string): boolean {
  if (!/^(?:[0-9a-f]{2})*$/.test(grants) || grants.length !== 2 * Math.ceil(count / 8)) return false;
  const used = count % 8;
  if (used === 0) return true;
  return (Number.parseInt(grants.slice(-2), 16) >> used) === 0;
}

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
  /**
   * WI-OI-120w (R2 slice 3, ADR-0034 §5): the member's role assignments, each with what it grants and where. Absent
   * (a context minted before this claim) means every permission applies at the member's own scope, as `MEMBER` does.
   */
  assignments: PlatformContextAssignmentsSchema.optional(),
  entitlement: PlatformContextEntitlementSchema,
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().min(1),
}).superRefine((context, issues) => {
  context.assignments?.items.forEach((item, index) => {
    if (!assignmentGrantsFit(context.granted_scopes.length, item.grants))
      issues.addIssue({ code: 'custom', path: ['assignments', 'items', index, 'grants'], message: 'An assignment must name only the context\'s granted scopes.' });
  });
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
