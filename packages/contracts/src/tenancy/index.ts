import { z } from 'zod';
import { EmailSchema, SlugSchema, UrlSchema } from '../common/index.js';
import { SpatialScopePlaceIdsSchema } from '../geospatial/index.js';

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
 */
export const TENANT_PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9-]*:(?:\*|[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?)$/;

export function isTenantPermissionCode(value: unknown): value is string {
  return typeof value === 'string' && TENANT_PERMISSION_CODE_PATTERN.test(value) && !value.startsWith('platform:');
}

export const TenantPermissionSchema = z
  .string()
  .regex(TENANT_PERMISSION_CODE_PATTERN, 'Invalid tenant permission code')
  .refine((permission) => !permission.startsWith('platform:'), {
    message: 'Platform permissions cannot be delegated by a tenant role',
  });

const CustomRoleFieldsSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#6366f1'),
  permissions: z
    .array(TenantPermissionSchema)
    .max(100)
    .transform((permissions) => [...new Set(permissions)]),
});

export const CreateCustomRoleSchema = CustomRoleFieldsSchema;

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
      value.permissions !== undefined,
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
    customRoleId: z.string().min(1).nullable().optional(),
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
      value.customRoleId !== undefined ||
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
