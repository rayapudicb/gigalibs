import { z } from 'zod';
import { EmailSchema, PhoneSchema, UrlSchema } from '../common/index.js';

// ─── User Schemas ─────────────────────────────────────────────────────────────

export const UserStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'DEACTIVATED']);

export const UserSchema = z.object({
  id: z.string(),
  email: EmailSchema,
  phone: PhoneSchema.optional(),
  name: z.string(),
  avatarUrl: UrlSchema.optional(),
  status: UserStatusSchema,
  emailVerifiedAt: z.date().optional(),
  phoneVerifiedAt: z.date().optional(),
  lastLoginAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const UpdateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    phone: PhoneSchema.nullable().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .refine((value) => value.name !== undefined || value.phone !== undefined, {
    message: 'A profile change is required',
  });

export const UserPreferencesSchema = z.object({
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.string().default('DD/MM/YYYY'),
  notifications: z.object({
    email: z.boolean().default(true),
    sms: z.boolean().default(false),
    push: z.boolean().default(true),
    inApp: z.boolean().default(true),
  }).default({ email: true, sms: false, push: true, inApp: true }),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type UserStatus = z.infer<typeof UserStatusSchema>;
export type User = z.infer<typeof UserSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
