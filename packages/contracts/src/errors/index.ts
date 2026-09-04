import { z } from 'zod';

// ─── Error Codes ──────────────────────────────────────────────────────────────
// Consistent machine-readable codes used across all modules.
// Format: MODULE_ERROR_NAME

export const ErrorCode = {
  // Auth
  AUTH_INVALID_CREDENTIALS:    'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED:          'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID:          'AUTH_TOKEN_INVALID',
  AUTH_OTP_INVALID:            'AUTH_OTP_INVALID',
  AUTH_OTP_EXPIRED:            'AUTH_OTP_EXPIRED',
  AUTH_OTP_TOO_MANY_ATTEMPTS:  'AUTH_OTP_TOO_MANY_ATTEMPTS',
  AUTH_SESSION_NOT_FOUND:      'AUTH_SESSION_NOT_FOUND',
  AUTH_EMAIL_NOT_VERIFIED:     'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_PASSKEY_FAILED:         'AUTH_PASSKEY_FAILED',

  // RBAC
  RBAC_PERMISSION_DENIED:      'RBAC_PERMISSION_DENIED',
  RBAC_ROLE_NOT_FOUND:         'RBAC_ROLE_NOT_FOUND',

  // Tenancy
  TENANT_NOT_FOUND:            'TENANT_NOT_FOUND',
  TENANT_SUSPENDED:            'TENANT_SUSPENDED',
  TENANT_SLUG_TAKEN:           'TENANT_SLUG_TAKEN',
  TENANT_FEATURE_DISABLED:     'TENANT_FEATURE_DISABLED',

  // Users
  USER_NOT_FOUND:              'USER_NOT_FOUND',
  USER_ALREADY_EXISTS:         'USER_ALREADY_EXISTS',
  USER_SUSPENDED:              'USER_SUSPENDED',

  // Billing
  BILLING_SUBSCRIPTION_REQUIRED: 'BILLING_SUBSCRIPTION_REQUIRED',
  BILLING_PAYMENT_FAILED:        'BILLING_PAYMENT_FAILED',
  BILLING_PLAN_LIMIT_REACHED:    'BILLING_PLAN_LIMIT_REACHED',

  // Storage
  STORAGE_FILE_TOO_LARGE:      'STORAGE_FILE_TOO_LARGE',
  STORAGE_FILE_TYPE_INVALID:   'STORAGE_FILE_TYPE_INVALID',
  STORAGE_NOT_FOUND:           'STORAGE_NOT_FOUND',

  // Common
  VALIDATION_ERROR:            'VALIDATION_ERROR',
  NOT_FOUND:                   'NOT_FOUND',
  CONFLICT:                    'CONFLICT',
  RATE_LIMITED:                'RATE_LIMITED',
  INTERNAL_ERROR:              'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

// ─── Error response schema (all API errors follow this shape) ─────────────────

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
