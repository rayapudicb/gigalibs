import { z } from 'zod';
import { EmailSchema, PhoneSchema } from '../common/index.js';

// ─── Auth DTOs ────────────────────────────────────────────────────────────────

export const RegisterWithEmailSchema = z.object({
  email: EmailSchema,
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
  name: z.string().min(1).max(100),
});

export const LoginWithEmailSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});

export const RequestOTPSchema = z
  .object({
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
  })
  .refine((d) => d.email ?? d.phone, { message: 'Either email or phone required' });

export const VerifyOTPSchema = z
  .object({
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
    code: z.string().length(6, 'OTP must be 6 digits'),
  })
  .refine((d) => d.email ?? d.phone, { message: 'Either email or phone required' });

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const SelectTenantSchema = z.object({
  tenantId: z.string().min(1),
});

export const VerifyTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP code must contain exactly 6 digits'),
});

export const GenerateMfaRecoveryCodesSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const VerifyMfaRecoveryCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){4}$/,
      'Recovery code must contain five groups of four characters',
    ),
});

export const RequestMfaAssistedRecoverySchema = z.object({
  targetMemberId: z.string().trim().min(1).max(200),
  identityEvidenceReference: z.string().trim().min(3).max(500),
  reason: z.string().trim().min(3).max(500),
});

export const DecideMfaAssistedRecoverySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const ConsumeMfaAssistedRecoverySchema = z.object({
  grant: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{43}$/, 'Recovery grant is invalid'),
});

const OidcScopeSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/, 'OIDC scopes may contain only token characters');

export const UpsertTenantOidcConfigurationSchema = z
  .object({
    issuer: z.string().trim().url().max(2048),
    clientId: z.string().trim().min(1).max(500),
    clientSecret: z.string().min(1).max(4096).optional(),
    scopes: z.array(OidcScopeSchema).min(1).max(20).default(['openid', 'email', 'profile']),
    enabled: z.boolean(),
    allowJitProvisioning: z.boolean().default(false),
    defaultRole: z.enum(['MEMBER', 'VIEWER']).default('MEMBER'),
    expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
    reason: z.string().trim().min(3).max(500),
  })
  .superRefine((value, context) => {
    if (!value.scopes.includes('openid')) {
      context.addIssue({ code: 'custom', path: ['scopes'], message: 'openid scope is required' });
    }
    if (new Set(value.scopes).size !== value.scopes.length) {
      context.addIssue({ code: 'custom', path: ['scopes'], message: 'OIDC scopes must be unique' });
    }
  });

export const DeleteTenantOidcConfigurationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const StartOidcLoginSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
});

export const StartOidcLinkSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const RevokeExternalIdentitySchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  currentPassword: z.string().min(1).max(128),
  reason: z.string().trim().min(3).max(500),
});

export const CompleteOidcLoginSchema = z
  .object({
    code: z.string().min(1).max(4096).optional(),
    state: z.string().min(1).max(4096).optional(),
    error: z.string().min(1).max(200).optional(),
    errorDescription: z.string().max(1000).optional(),
  })
  .refine((value) => value.error || (value.code && value.state), {
    message: 'An authorization code and state are required',
  });

export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export const ResetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{43}$/, 'Password reset credential is invalid'),
  password: z.string().min(12, 'Password must be at least 12 characters').max(128),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12, 'Password must be at least 12 characters').max(128),
});

// ─── Token Payloads ───────────────────────────────────────────────────────────

export const AccessTokenPayloadSchema = z.object({
  sub: z.string(), // userId
  tid: z.string().optional(), // tenantId is absent until a tenant is selected
  sid: z.string(), // sessionId
  roles: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
});

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
  requiresMfa: z.boolean().optional(),
  mfaEnrolled: z.boolean().optional(),
});

export const OidcLinkResultSchema = z.object({
  type: z.literal('EXTERNAL_IDENTITY_LINKED'),
  identityId: z.string().min(1),
  tenantId: z.string().min(1),
  issuer: z.string().url(),
  status: z.literal('ACTIVE'),
  updatedAt: z.string().datetime({ offset: true }),
});

export const CompleteOidcAuthorizationResponseSchema = z.union([
  AuthResponseSchema,
  OidcLinkResultSchema,
]);

// ─── Inferred types ───────────────────────────────────────────────────────────

export type RegisterWithEmailDto = z.infer<typeof RegisterWithEmailSchema>;
export type LoginWithEmailDto = z.infer<typeof LoginWithEmailSchema>;
export type RequestOTPDto = z.infer<typeof RequestOTPSchema>;
export type VerifyOTPDto = z.infer<typeof VerifyOTPSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
export type SelectTenantDto = z.infer<typeof SelectTenantSchema>;
export type VerifyTotpDto = z.infer<typeof VerifyTotpSchema>;
export type GenerateMfaRecoveryCodesDto = z.infer<typeof GenerateMfaRecoveryCodesSchema>;
export type VerifyMfaRecoveryCodeDto = z.infer<typeof VerifyMfaRecoveryCodeSchema>;
export type RequestMfaAssistedRecoveryDto = z.infer<typeof RequestMfaAssistedRecoverySchema>;
export type DecideMfaAssistedRecoveryDto = z.infer<typeof DecideMfaAssistedRecoverySchema>;
export type ConsumeMfaAssistedRecoveryDto = z.infer<typeof ConsumeMfaAssistedRecoverySchema>;
export type UpsertTenantOidcConfigurationDto = z.infer<typeof UpsertTenantOidcConfigurationSchema>;
export type DeleteTenantOidcConfigurationDto = z.infer<typeof DeleteTenantOidcConfigurationSchema>;
export type StartOidcLoginDto = z.infer<typeof StartOidcLoginSchema>;
export type StartOidcLinkDto = z.infer<typeof StartOidcLinkSchema>;
export type RevokeExternalIdentityDto = z.infer<typeof RevokeExternalIdentitySchema>;
export type CompleteOidcLoginDto = z.infer<typeof CompleteOidcLoginSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type OidcLinkResult = z.infer<typeof OidcLinkResultSchema>;
export type CompleteOidcAuthorizationResponse = z.infer<
  typeof CompleteOidcAuthorizationResponseSchema
>;
