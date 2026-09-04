import { z } from 'zod';
import { EmailSchema, SlugSchema, UrlSchema } from '../common/index.js';

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
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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
  branding: TenantBrandingSchema.optional(),
  features: z.array(z.string()).default([]),   // enabled feature flags
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
  customDomain: z.string().min(3).max(253).optional(),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  branding: TenantBrandingSchema.optional(),
});

export const ChangeTenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'MAINTENANCE', 'CANCELLED']),
  reason: z.string().min(3).max(500),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type TenantStatus = z.infer<typeof TenantStatusSchema>;
export type TenantIsolationMode = z.infer<typeof TenantIsolationModeSchema>;
export type TenantBranding = z.infer<typeof TenantBrandingSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type CreateTenantDto = z.infer<typeof CreateTenantSchema>;
export type UpdateTenantDto = z.infer<typeof UpdateTenantSchema>;
export type ChangeTenantStatusDto = z.infer<typeof ChangeTenantStatusSchema>;

// Runtime context injected into every request
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  features: string[];
  plan: string | null;
}
