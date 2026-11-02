import { z } from 'zod';

// WI-OI-120cf: the `/mobile/v1` identity and session contract, as the mobile team's candidate schemas define it
// (`gigalibs_mobile/packages/mobile-contracts/src/index.ts`, read 2026-10-22). The platform mirrors those shapes field
// for field and never adds to them; until one shared artifact is published and pinned in both repositories, the
// fixtures in `mobile.test.ts` are the agreement. `mobile-logout.v1` is the mobile team's proposed shape.

/** The installation a mobile credential is bound to: the app's own UUID, sent as `X-Gigalibs-Installation-Id`. */
export const MobileInstallationIdSchema = z.uuid();

export const MobileAppProfileSchema = z.string().min(1).max(100);

const OpaqueIdSchema = z
  .string()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9._~-]+$/);

export const MobilePasswordSignInV1Schema = z
  .object({
    contractVersion: z.literal('mobile-password-sign-in.v1'),
    email: z.email().max(320),
    password: z.string().min(1).max(1_024),
    appProfile: MobileAppProfileSchema,
  })
  .strict();
export type MobilePasswordSignInV1 = z.infer<typeof MobilePasswordSignInV1Schema>;

export const MobileMfaVerificationV1Schema = z
  .object({
    contractVersion: z.literal('mobile-mfa-verification.v1'),
    appProfile: MobileAppProfileSchema,
    challengeId: OpaqueIdSchema,
    code: z
      .string()
      .min(6)
      .max(12)
      .regex(/^[0-9]+$/),
  })
  .strict();
export type MobileMfaVerificationV1 = z.infer<typeof MobileMfaVerificationV1Schema>;

export const MobileMembershipSelectionV1Schema = z
  .object({
    contractVersion: z.literal('mobile-membership-selection.v1'),
    selectionId: z.string().trim().pipe(OpaqueIdSchema),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type MobileMembershipSelectionV1 = z.infer<typeof MobileMembershipSelectionV1Schema>;

export const MobileRefreshTokenV1Schema = z
  .object({
    contractVersion: z.literal('mobile-refresh-token.v1'),
    refreshToken: z.string().min(1).max(512),
    appProfile: MobileAppProfileSchema,
  })
  .strict();
export type MobileRefreshTokenV1 = z.infer<typeof MobileRefreshTokenV1Schema>;

export const MobileLogoutV1Schema = z.object({ contractVersion: z.literal('mobile-logout.v1') }).strict();
export type MobileLogoutV1 = z.infer<typeof MobileLogoutV1Schema>;

const MobileTokenSetV2BaseSchema = z
  .object({
    contractVersion: z.literal('mobile-token-set.v2'),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    accessTokenExpiresAt: z.iso.datetime(),
  })
  .strict();

export const MobileTokenSetV2Schema = z.discriminatedUnion('binding', [
  MobileTokenSetV2BaseSchema.extend({ binding: z.literal('PRE_TENANT') }),
  MobileTokenSetV2BaseSchema.extend({ binding: z.literal('TENANT_BOUND') }),
]);
export type MobileTokenSetV2 = z.infer<typeof MobileTokenSetV2Schema>;
export type MobileBinding = MobileTokenSetV2['binding'];

/** An MFA challenge is pre-authentication state: it never carries a token. */
export const MobileMfaChallengeV1Schema = z
  .object({
    contractVersion: z.literal('mobile-mfa-challenge.v1'),
    challengeId: OpaqueIdSchema,
    method: z.enum(['TOTP', 'EMAIL_OTP']),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type MobileMfaChallengeV1 = z.infer<typeof MobileMfaChallengeV1Schema>;

export const MobilePasswordAuthResultV1Schema = z.union([MobileTokenSetV2Schema, MobileMfaChallengeV1Schema]);
export type MobilePasswordAuthResultV1 = z.infer<typeof MobilePasswordAuthResultV1Schema>;

export const MOBILE_MEMBERSHIP_PAGE_LIMIT = 50;

export const MobileMembershipPageV1Schema = z
  .object({
    contractVersion: z.literal('mobile-membership-page.v1'),
    items: z
      .array(
        z
          .object({
            selectionId: OpaqueIdSchema,
            tenantDisplayName: z.string().trim().min(1).max(200),
            membershipLabel: z.string().trim().min(1).max(120),
            lastUsedAt: z.iso.datetime().nullable(),
          })
          .strict(),
      )
      .max(MOBILE_MEMBERSHIP_PAGE_LIMIT),
    generatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((page, context) => {
    if (new Set(page.items.map((item) => item.selectionId)).size !== page.items.length)
      context.addIssue({ code: 'custom', path: ['items'], message: 'Membership selection IDs must be unique.' });
    if (Date.parse(page.expiresAt) <= Date.parse(page.generatedAt))
      context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Choices must expire after they are generated.' });
  });
export type MobileMembershipPageV1 = z.infer<typeof MobileMembershipPageV1Schema>;

export const MobilePersonaSchema = z.enum([
  'PLATFORM_OPERATOR',
  'C_LEVEL',
  'TENANT_ADMIN',
  'OPERATIONS_SUPERVISOR',
  'WORKFORCE_MEMBER',
  'CUSTOMER_GUEST',
]);

/** The most places one spatial scope may name in the mobile session. */
export const MOBILE_MAX_SPATIAL_SCOPE_PLACES = 50;
/** The most role assignments a mobile session carries (the member's own plus twenty roles). */
export const MOBILE_MAX_ASSIGNMENTS = 21;
export const MOBILE_MAX_ASSIGNMENT_UNITS = 200;

const SessionIdentifierSchema = z.string().trim().min(1).max(200);
const unique = (values: readonly string[]) => new Set(values).size === values.length;

const MobileSpatialScopeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('UNBOUNDED') }).strict(),
  z
    .object({ mode: z.literal('SCOPED_PLACES'), placeIds: z.array(z.uuid()).max(MOBILE_MAX_SPATIAL_SCOPE_PLACES) })
    .strict()
    .refine((scope) => unique(scope.placeIds), { path: ['placeIds'], message: 'Each scoped place may appear only once.' }),
]);

const MobileMemberOrgScopeV3Schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('FLAT_TENANT') }).strict(),
  z
    .object({ mode: z.literal('SCOPED_DEPARTMENTS'), departmentIds: z.array(SessionIdentifierSchema).max(1_000) })
    .strict()
    .refine((scope) => unique(scope.departmentIds), { path: ['departmentIds'], message: 'Department ids must be unique.' }),
]);

export const MobileAssignmentScopeV3Schema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('MEMBER') }).strict(),
    z.object({ kind: z.literal('TENANT') }).strict(),
    z
      .object({
        kind: z.literal('UNITS'),
        treeVersion: SessionIdentifierSchema,
        unitIds: z.array(SessionIdentifierSchema).min(1).max(MOBILE_MAX_ASSIGNMENT_UNITS),
      })
      .strict(),
    z
      .object({ kind: z.literal('PLACES'), placeIds: z.array(z.uuid()).min(1).max(MOBILE_MAX_SPATIAL_SCOPE_PLACES) })
      .strict(),
  ])
  .superRefine((scope, context) => {
    const ids = scope.kind === 'UNITS' ? scope.unitIds : scope.kind === 'PLACES' ? scope.placeIds : null;
    if (ids && !unique(ids)) context.addIssue({ code: 'custom', message: 'Scope ids must be unique.' });
  });
export type MobileAssignmentScopeV3 = z.infer<typeof MobileAssignmentScopeV3Schema>;

const MobileModuleGrantV2Schema = z
  .object({
    key: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
    enabled: z.boolean(),
    navigationOrder: z.number().int().min(0).max(10_000),
    capabilities: z
      .array(
        z
          .string()
          .trim()
          .min(3)
          .max(160)
          .regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/),
      )
      .max(500)
      .refine(unique, 'Capability grants must be unique within a module.'),
    presentationRevision: z.string().trim().min(1).max(200),
    requiredDeviceCapabilities: z.array(z.enum(['camera', 'location', 'nfc', 'biometrics', 'notifications'])).max(8),
  })
  .strict();

export const MobileSessionV3Schema = z
  .object({
    contractVersion: z.literal('mobile-session.v3'),
    sessionRevision: z.number().int().nonnegative(),
    authorizationRevision: z.number().int().nonnegative(),
    configurationRevision: z.number().int().nonnegative(),
    tenant: z.object({ id: SessionIdentifierSchema, displayName: SessionIdentifierSchema }).strict(),
    user: z.object({ id: SessionIdentifierSchema, displayName: SessionIdentifierSchema }).strict(),
    membershipId: SessionIdentifierSchema,
    persona: MobilePersonaSchema,
    entitlements: z.array(SessionIdentifierSchema).max(500),
    memberOrganizationScope: MobileMemberOrgScopeV3Schema,
    memberSpatialScope: MobileSpatialScopeSchema,
    assignments: z
      .array(
        z
          .object({
            assignmentId: SessionIdentifierSchema,
            permissions: z.array(z.string().trim().min(1).max(200)).max(5_000).refine(unique, 'Duplicate permission.'),
            scope: MobileAssignmentScopeV3Schema,
          })
          .strict(),
      )
      .max(MOBILE_MAX_ASSIGNMENTS),
    modules: z.array(MobileModuleGrantV2Schema).max(100),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((session, context) => {
    for (const [name, values] of [
      ['assignments', session.assignments.map((item) => item.assignmentId)],
      ['modules', session.modules.map((item) => item.key)],
      ['entitlements', session.entitlements],
    ] as const) {
      if (!unique(values)) context.addIssue({ code: 'custom', path: [name], message: `Duplicate ${name} entry.` });
    }
  });
export type MobileSessionV3 = z.infer<typeof MobileSessionV3Schema>;

/**
 * Every refusal the mobile BFF answers, with its HTTP status. The mobile team's suggested catalogue, plus what the
 * platform needs besides: a request that breaks its contract, an authenticator the user must enrol on the web first, a
 * retried switch whose idempotency key was used for another choice, a workspace choice that has expired, an unknown
 * route and a service that is unavailable.
 */
export const MOBILE_PROBLEMS = {
  MOBILE_REQUEST_INVALID: { status: 400, title: 'The request does not match its contract.' },
  MOBILE_INVALID_CREDENTIALS: { status: 401, title: 'The email or password is not right.' },
  MOBILE_ACCOUNT_LOCKED: { status: 423, title: 'Too many failed sign-in attempts. Try again later.' },
  MOBILE_MFA_INVALID: { status: 401, title: 'The authenticator code is not right.' },
  MOBILE_MFA_EXPIRED: { status: 410, title: 'The sign-in took too long. Sign in again.' },
  MOBILE_MFA_ENROLLMENT_REQUIRED: { status: 403, title: 'Set up an authenticator app on the web first.' },
  MOBILE_MEMBERSHIP_NONE: { status: 403, title: 'This account has no workspace it can use.' },
  MOBILE_MEMBERSHIP_REVOKED: { status: 403, title: 'Access to this workspace has ended.' },
  MOBILE_AUTH_REQUIRED: { status: 401, title: 'Sign in again.' },
  MOBILE_SCOPE_DENIED: { status: 403, title: 'This sign-in cannot use that.' },
  MOBILE_NOT_FOUND: { status: 404, title: 'There is no such mobile route.' },
  MOBILE_IDEMPOTENCY_CONFLICT: { status: 409, title: 'That request key was already used for another choice.' },
  MOBILE_ROUND_CONFLICT: { status: 409, title: 'The round changed. Reload the assignment and reconcile your pending work.' },
  MOBILE_CALIBRATION_CONFLICT: {
    status: 409,
    title: 'The calibration profile or a standard changed. Download the instrument again and repeat the calibration.',
  },
  MOBILE_LOGBOOK_CONFLICT: {
    status: 409,
    title: 'The handover, bypass or entry changed, or this capture was already sent. Reload the logbook and try again.',
  },
  MOBILE_SPARES_CONFLICT: {
    status: 409,
    title: 'Not enough stock is available, the work order is closed, or this reservation was already sent. Reload and try again.',
  },
  MOBILE_SOP_CONFLICT: {
    status: 409,
    title: 'The procedure moved on: a step waits for a countersign, was already recorded, or the revision was withdrawn. Reload and try again.',
  },
  MOBILE_FLEET_CONFLICT: {
    status: 409,
    title: 'The check changed, the asset is already grounded or not enrolled, or this capture was already sent. Reload and try again.',
  },
  MOBILE_COMMISSIONING_CONFLICT: {
    status: 409,
    title: 'The tag is already bound, the walk is finished, or this capture was already used. Check and try again.',
  },
  MOBILE_SELECTION_EXPIRED: { status: 410, title: 'That choice has expired. Load the workspaces again.' },
  MOBILE_CONTRACT_UNSUPPORTED: { status: 426, title: 'This app version or profile is not supported.' },
  MOBILE_UNAVAILABLE: { status: 503, title: 'The service is unavailable. Try again shortly.' },
  MOBILE_UPSTREAM_TIMEOUT: { status: 504, title: 'The service took too long to answer.' },
} as const satisfies Record<string, { readonly status: number; readonly title: string }>;
export type MobileProblemCode = keyof typeof MOBILE_PROBLEMS;

export const MobileProblemV1Schema = z
  .object({
    type: z.string(),
    title: z.string().min(1),
    status: z.number().int().min(400).max(599),
    code: z.string().min(1),
    correlationId: z.string().min(1).optional(),
    detail: z.string().optional(),
  })
  .strict();
export type MobileProblemV1 = z.infer<typeof MobileProblemV1Schema>;

export function mobileProblem(code: MobileProblemCode, correlationId?: string): MobileProblemV1 {
  const { status, title } = MOBILE_PROBLEMS[code];
  return { type: 'about:blank', title, status, code, ...(correlationId ? { correlationId } : {}) };
}
