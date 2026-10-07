import { z } from 'zod';
import { EmailSchema, SlugSchema, UrlSchema } from '../common/index.js';
import { SpatialScopePlaceIdsSchema } from '../geospatial/index.js';
import { isCataloguedPermission } from '../rbac/control-plane-permissions.js';

// ─── Tenancy Schemas ─────────────────────────────────────────────────────────

export const TenantStatusSchema = z.enum([
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'MAINTENANCE',
  'TRIAL',
  'CANCELLED',
]);

export const TenantIsolationModeSchema = z.enum([
  'ROW_LEVEL_SECURITY',
  'SCHEMA_ISOLATED',
  'DEDICATED_DATABASE',
]);

export const TenantBrandingSchema = z.object({
  logoUrl: UrlSchema.optional(),
  faviconUrl: UrlSchema.optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  companyName: z.string().optional(),
  supportEmail: EmailSchema.optional(),
  customDomain: z.string().optional(),
});

export const TenantSchema = z.object({
  id: z.string(),
  slug: SlugSchema,
  name: z.string().min(1).max(100),
  status: TenantStatusSchema,
  isolationMode: TenantIsolationModeSchema,
  region: z.string(),
  customDomain: z.string().nullable().optional(),
  customDomainVerifiedAt: z.date().nullable().optional(),
  branding: TenantBrandingSchema.optional(),
  features: z.array(z.string()).default([]), // enabled feature flags
  plan: z.string().optional(),
  trialEndsAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(100),
  slug: SlugSchema,
  ownerEmail: EmailSchema.optional(),
  plan: z.string().optional(),
  isolationMode: TenantIsolationModeSchema.default('ROW_LEVEL_SECURITY'),
  region: z.string().min(1).max(100).default('local'),
});

export const CreateTenantDomainChallengeSchema = z.object({
  domain: z.string().trim().min(4).max(253),
  reason: z.string().trim().min(3).max(500),
});

export const VerifyTenantDomainSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const RevokeTenantDomainSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  branding: TenantBrandingSchema.optional(),
});

export const ChangeTenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'MAINTENANCE', 'CANCELLED']),
  reason: z.string().min(3).max(500),
});

export const TenantMemberRoleSchema = z.enum([
  'TENANT_ADMIN',
  'MANAGER',
  'MEMBER',
  'VIEWER',
  'GUEST',
]);

export const CreateTenantInviteSchema = z.object({
  email: EmailSchema.transform((email) => email.trim().toLowerCase()),
  role: TenantMemberRoleSchema.default('MEMBER'),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

export const AcceptTenantInviteSchema = z.object({
  token: z.string().min(32).max(512),
});

/**
 * A tenant permission code: `resource:action`, `resource:*`, or (WI-OI-103e, ADR-0016 F16) `module:resource:action`
 * such as `analytics:charts:write`. `resource:*` covers the three-part codes of that resource. A wildcard is only
 * allowed as the whole action of a two-part code, and `platform:` codes are never delegated by a tenant role.
 *
 * WI-OI-120n: also the dotted codes CMMS, Workforce and Geospatial check, such as `cmms.work-orders.write`,
 * `workforce.time.punch` or `maps.nodes.read` (two to four parts, never a wildcard), so a tenant role can carry them.
 * Before this, no custom role could hold a CMMS or Workforce permission.
 */
export const TENANT_PERMISSION_CODE_PATTERN =
  /^(?:[a-z][a-z0-9-]*:(?:\*|[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)|[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,3})$/;

const isPlatformCode = (value: string) => value.startsWith('platform:') || value.startsWith('platform.');

export function isTenantPermissionCode(value: unknown): value is string {
  return typeof value === 'string' && TENANT_PERMISSION_CODE_PATTERN.test(value) && !isPlatformCode(value);
}

export const TenantPermissionSchema = z
  .string()
  .regex(TENANT_PERMISSION_CODE_PATTERN, 'Invalid tenant permission code')
  .refine((permission) => !isPlatformCode(permission), {
    message: 'Platform permissions cannot be delegated by a tenant role',
  });

/**
 * WI-OI-120w review (High P1): names a custom role may not take, compared without case, spaces or hyphens. A custom
 * role's name reaches the session's role list, from which personas and tenant-wide authority were read; a role named
 * "Tenant admin" must never pass for the base role. Base roles, platform roles and the persona words that carry
 * authority are reserved.
 */
export const RESERVED_ROLE_NAMES: ReadonlySet<string> = new Set([
  'SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'GUEST',
  'PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_AUDITOR', 'PLATFORM_OPERATOR', 'PLATFORM_SUPPORT',
  'ADMIN', 'ADMINISTRATOR', 'OWNER', 'C_LEVEL', 'EXECUTIVE', 'CEO', 'CFO', 'CTO', 'COO',
]);

/** Whether a role name collides with a reserved one ("tenant admin", "Tenant-Admin" and "TENANT_ADMIN" do). */
export function isReservedRoleName(name: string): boolean {
  return RESERVED_ROLE_NAMES.has(name.trim().toUpperCase().replace(/[\s-]+/g, '_'));
}

const CustomRoleFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine((name) => !isReservedRoleName(name), { message: 'This name belongs to a built-in role; choose another' }),
  description: z.string().trim().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#6366f1'),
  permissions: z
    .array(TenantPermissionSchema)
    .max(100)
    .transform((permissions) => [...new Set(permissions)]),
  /**
   * WI-OI-120w (R2 slice 2c, ADR-0034 §2): other roles of the workspace this role includes; it grants their permissions
   * too, at the scope it is held. The service keeps the graph acyclic and at most MAX_ROLE_INCLUSION_DEPTH deep.
   */
  includes: z
    .array(z.string().trim().min(1).max(64))
    .max(10)
    .transform((ids) => [...new Set(ids)])
    .optional(),
});

/** WI-OI-120w (R2 slice 2c): how many roles one role may include, and how deep inclusion may go. */
export const MAX_ROLE_INCLUSIONS = 10;
export const MAX_ROLE_INCLUSION_DEPTH = 5;

/**
 * WI-OI-120q (R1): a new role holds only permissions some screen, route or service checks (PERMISSION_CATALOGUE). An
 * existing role keeps what it already holds; the update path refuses only additions (`uncataloguedAdditions`).
 */
/**
 * WI-OI-120w (R2 slice 2a): giving a member a role, or taking one away. A member may hold several roles; each is a role
 * assignment at the member's own scope. Every change carries a reason.
 */
// Counted in characters, as the database's CHECK counts it (Security review of 2a, Info): two emoji are two characters.
const RoleChangeReasonSchema = z
  .string()
  .trim()
  .refine((value) => [...value].length >= 3 && [...value].length <= 500, { error: 'Give a reason of 3 to 500 characters.' });
/**
 * WI-OI-120w (R2 slice 2b, ADR-0034 §1): where a role applies. `MEMBER` (the default) is the member's own scope as
 * today; the others are given by a Tenant Admin: the whole workspace, some units (each with everything below it in the
 * primary tree) or some places (each with everything inside it).
 */
export const MemberRoleScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('MEMBER') }).strict(),
  z.object({ kind: z.literal('WORKSPACE') }).strict(),
  z
    .object({
      kind: z.literal('UNITS'),
      unitIds: z
        .array(z.string().trim().min(1).max(64))
        .min(1)
        .max(200)
        .refine((ids) => new Set(ids).size === ids.length, 'List each unit once.'),
    })
    .strict(),
  z.object({ kind: z.literal('PLACES'), placeIds: SpatialScopePlaceIdsSchema.refine((ids) => ids.length > 0, 'Choose at least one place.') }).strict(),
]);
export type MemberRoleScope = z.infer<typeof MemberRoleScopeSchema>;

export const AssignMemberRoleSchema = z
  .object({
    customRoleId: z.string().trim().min(1).max(64),
    reason: RoleChangeReasonSchema,
    scope: MemberRoleScopeSchema.default({ kind: 'MEMBER' }),
  })
  .strict();
export const RevokeMemberRoleSchema = z.object({ reason: RoleChangeReasonSchema }).strict();
/** The request: `scope` may be left out, meaning the member's own scope. */
export type AssignMemberRoleDto = z.input<typeof AssignMemberRoleSchema>;
export type RevokeMemberRoleDto = z.infer<typeof RevokeMemberRoleSchema>;

/**
 * A role a member holds, as Settings → Team lists it to anyone with `users:read`. Who granted it and why stay in the
 * audit log (Security review of 2a, L3).
 */
export interface MemberRoleAssignmentView {
  readonly id: string;
  readonly customRoleId: string;
  readonly scope: 'MEMBER' | 'WORKSPACE' | 'UNITS' | 'PLACES';
  /** The units or places an explicit scope names (WI-OI-120w slice 2b); empty otherwise. */
  readonly unitIds: readonly string[];
  readonly placeIds: readonly string[];
  readonly createdAt: string;
  readonly customRole: { readonly name: string; readonly color: string };
}

export const CreateCustomRoleSchema = CustomRoleFieldsSchema.superRefine((role, context) => {
  role.permissions.forEach((permission, index) => {
    if (!isCataloguedPermission(permission))
      context.addIssue({
        code: 'custom',
        path: ['permissions', index],
        message: 'No screen or service checks this permission; choose one from the permission list',
      });
  });
});

export const UpdateCustomRoleSchema = CustomRoleFieldsSchema.partial()
  .extend({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.color !== undefined ||
      value.permissions !== undefined ||
      value.includes !== undefined,
    { message: 'A custom role change is required' },
  );

export const DeleteCustomRoleSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const EmploymentTypeSchema = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'SEASONAL',
  'INTERN',
]);
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;

export const UpdateTenantMemberSchema = z
  .object({
    role: TenantMemberRoleSchema.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    // WI-OI-120w (Security review of 2a, M2): roles are given and taken away only through role assignments, behind
    // `roles:assign`. Setting the single column here bypassed that permission and the self-assignment rule.
    customRoleId: z
      .never({ error: 'Roles are given and taken away one at a time (role assignments in Settings → Team).' })
      .optional(),
    departmentId: z.string().min(1).nullable().optional(),
    employmentType: EmploymentTypeSchema.nullable().optional(),
    /** Places (with everything inside them) the member may reach once the tenant opts in to spatial scoping. */
    spatialScopePlaceIds: SpatialScopePlaceIdsSchema.optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(3).max(500),
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.status !== undefined ||
      value.departmentId !== undefined ||
      value.employmentType !== undefined ||
      value.spatialScopePlaceIds !== undefined,
    {
      message: 'A role, status, department, employment type, or spatial scope change is required',
    },
  );

export const CreateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code must be alphanumeric and may contain hyphens or underscores'),
  parentId: z.string().min(1).nullable().optional(),
  managerId: z.string().min(1).nullable().optional(),
  spendingLimit: z.number().nonnegative().nullable().optional(),
});
export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code must be alphanumeric and may contain hyphens or underscores')
    .optional(),
  parentId: z.string().min(1).nullable().optional(),
  managerId: z.string().min(1).nullable().optional(),
  spendingLimit: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;

export const UpdateTenantOrganizationSettingsSchema = z
  .object({
    hierarchyEnabled: z.boolean().optional(),
    /** Opt-in: members other than tenant administrators only reach their assigned place sub-trees. */
    spatialScopingEnabled: z.boolean().optional(),
  })
  .refine(
    (value) => value.hierarchyEnabled !== undefined || value.spatialScopingEnabled !== undefined,
    { message: 'A hierarchy or spatial scoping change is required' },
  );
export type UpdateTenantOrganizationSettingsDto = z.infer<
  typeof UpdateTenantOrganizationSettingsSchema
>;

export const CreateTenantDataExportSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
});

// ─── Global platform administration ─────────────────────────────────────────

export const PlatformRoleSchema = z.enum(['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_AUDITOR']);

export const PlatformModuleKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{1,79}$/, 'Invalid module key');

export const PlatformCreateTenantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: SlugSchema,
  ownerEmail: EmailSchema,
  trialDays: z.number().int().min(1).max(90).default(7),
  isolationMode: TenantIsolationModeSchema.default('ROW_LEVEL_SECURITY'),
  region: z.string().trim().min(1).max(100).default('local'),
  moduleKeys: z.array(PlatformModuleKeySchema).max(100).default([]),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformTenantStatusChangeSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'MAINTENANCE', 'CANCELLED']),
  plan: z.string().trim().min(1).max(100).optional(),
  billingReference: z.string().trim().min(3).max(500).optional(),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformTrialExtensionSchema = z.object({
  days: z.number().int().min(1).max(90),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformEntitlementUpdateSchema = z.object({
  moduleKeys: z.array(PlatformModuleKeySchema).max(100),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformIsolationRequestSchema = z.object({
  isolationMode: TenantIsolationModeSchema,
  region: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformUserQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DEACTIVATED']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const PlatformUserStatusChangeSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformRoleMutationSchema = z.object({
  role: PlatformRoleSchema,
  enabled: z.boolean(),
  expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformIssuePasswordResetSchema = z.object({
  expiresInMinutes: z.number().int().min(5).max(1440).default(30),
  reason: z.string().trim().min(3).max(500),
});

export const PlatformExternalIdentityMutationSchema = z.object({
  enabled: z.boolean(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3).max(500),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type TenantStatus = z.infer<typeof TenantStatusSchema>;
export type TenantIsolationMode = z.infer<typeof TenantIsolationModeSchema>;
export type TenantBranding = z.infer<typeof TenantBrandingSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type CreateTenantDto = z.infer<typeof CreateTenantSchema>;
export type CreateTenantDomainChallengeDto = z.infer<typeof CreateTenantDomainChallengeSchema>;
export type VerifyTenantDomainDto = z.infer<typeof VerifyTenantDomainSchema>;
export type RevokeTenantDomainDto = z.infer<typeof RevokeTenantDomainSchema>;
export type UpdateTenantDto = z.infer<typeof UpdateTenantSchema>;
export type ChangeTenantStatusDto = z.infer<typeof ChangeTenantStatusSchema>;
export type TenantMemberRole = z.infer<typeof TenantMemberRoleSchema>;
export type CreateTenantInviteDto = z.infer<typeof CreateTenantInviteSchema>;
export type AcceptTenantInviteDto = z.infer<typeof AcceptTenantInviteSchema>;
export type CreateCustomRoleDto = z.infer<typeof CreateCustomRoleSchema>;
export type UpdateCustomRoleDto = z.infer<typeof UpdateCustomRoleSchema>;
export type DeleteCustomRoleDto = z.infer<typeof DeleteCustomRoleSchema>;
export type UpdateTenantMemberDto = z.infer<typeof UpdateTenantMemberSchema>;
export type CreateTenantDataExportDto = z.infer<typeof CreateTenantDataExportSchema>;
export type PlatformRole = z.infer<typeof PlatformRoleSchema>;
export type PlatformCreateTenantDto = z.infer<typeof PlatformCreateTenantSchema>;
export type PlatformTenantStatusChangeDto = z.infer<typeof PlatformTenantStatusChangeSchema>;
export type PlatformTrialExtensionDto = z.infer<typeof PlatformTrialExtensionSchema>;
export type PlatformEntitlementUpdateDto = z.infer<typeof PlatformEntitlementUpdateSchema>;
export type PlatformIsolationRequestDto = z.infer<typeof PlatformIsolationRequestSchema>;
export type PlatformUserQueryDto = z.infer<typeof PlatformUserQuerySchema>;
export type PlatformUserStatusChangeDto = z.infer<typeof PlatformUserStatusChangeSchema>;
export type PlatformRoleMutationDto = z.infer<typeof PlatformRoleMutationSchema>;
export type PlatformIssuePasswordResetDto = z.infer<typeof PlatformIssuePasswordResetSchema>;
export type PlatformExternalIdentityMutationDto = z.infer<
  typeof PlatformExternalIdentityMutationSchema
>;

// Runtime context injected into every request
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  features: string[];
  plan: string | null;
}
