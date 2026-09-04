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

export const RequestOTPSchema = z.object({
  email: EmailSchema.optional(),
  phone: PhoneSchema.optional(),
}).refine((d) => d.email ?? d.phone, { message: 'Either email or phone required' });

export const VerifyOTPSchema = z.object({
  email: EmailSchema.optional(),
  phone: PhoneSchema.optional(),
  code: z.string().length(6, 'OTP must be 6 digits'),
}).refine((d) => d.email ?? d.phone, { message: 'Either email or phone required' });

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const SelectTenantSchema = z.object({
  tenantId: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// ─── Token Payloads ───────────────────────────────────────────────────────────

export const AccessTokenPayloadSchema = z.object({
  sub: z.string(),        // userId
  tid: z.string().optional(), // tenantId is absent until a tenant is selected
  sid: z.string(),        // sessionId
  roles: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
});

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type RegisterWithEmailDto = z.infer<typeof RegisterWithEmailSchema>;
export type LoginWithEmailDto = z.infer<typeof LoginWithEmailSchema>;
export type RequestOTPDto = z.infer<typeof RequestOTPSchema>;
export type VerifyOTPDto = z.infer<typeof VerifyOTPSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
export type SelectTenantDto = z.infer<typeof SelectTenantSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
