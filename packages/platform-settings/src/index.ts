import { z } from 'zod';

export const WhiteLabelBrandingSchema = z.object({
  appName: z.string().min(1).max(100),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  customCss: z.string().max(50_000).optional(),
  customDomain: z.string().max(253).optional(),
  emailSenderName: z.string().max(100).optional(),
  emailSenderAddress: z.string().email().optional(),
});

export const SecurityPolicySettingsSchema = z.object({
  enforceMfa: z.boolean(),
  passwordMinLength: z.number().int().min(8).max(128),
  passwordExpiryDays: z.number().int().min(0).max(3650),
  sessionTimeoutMinutes: z.number().int().min(5).max(43_200),
  maxFailedLoginAttempts: z.number().int().min(1).max(100),
  allowedIpRanges: z.array(z.string().min(3).max(64)).default([]),
});

export const LocalizationSettingsSchema = z.object({
  defaultLocale: z.string().min(2).max(20),
  defaultCurrency: z.string().length(3),
  timezone: z.string().min(1).max(100),
  dateFormat: z.string().min(1).max(30),
});

export const TenantPlatformSettingsSchema = z.object({
  tenantId: z.string(),
  version: z.number().int().positive(),
  branding: WhiteLabelBrandingSchema,
  security: SecurityPolicySettingsSchema,
  localization: LocalizationSettingsSchema,
  features: z.record(z.string(), z.boolean()),
  metadata: z.record(z.string(), z.unknown()),
});

export const TenantPlatformSettingsPatchSchema = z.object({
  expectedVersion: z.number().int().positive(),
  branding: WhiteLabelBrandingSchema.partial().optional(),
  security: SecurityPolicySettingsSchema.partial().optional(),
  localization: LocalizationSettingsSchema.partial().optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type WhiteLabelBranding = z.infer<typeof WhiteLabelBrandingSchema>;
export type SecurityPolicySettings = z.infer<typeof SecurityPolicySettingsSchema>;
export type LocalizationSettings = z.infer<typeof LocalizationSettingsSchema>;
export type TenantPlatformSettings = z.infer<typeof TenantPlatformSettingsSchema>;
export type TenantPlatformSettingsPatch = z.infer<typeof TenantPlatformSettingsPatchSchema>;

export const defaultSystemSettings: Omit<TenantPlatformSettings, 'tenantId'> = {
  version: 1,
  branding: {
    appName: 'GigaPlatform',
    primaryColor: '#2563eb',
  },
  security: {
    enforceMfa: false,
    passwordMinLength: 12,
    passwordExpiryDays: 0,
    sessionTimeoutMinutes: 1_440,
    maxFailedLoginAttempts: 5,
    allowedIpRanges: [],
  },
  localization: {
    defaultLocale: 'en-US',
    defaultCurrency: 'USD',
    timezone: 'UTC',
    dateFormat: 'yyyy-MM-dd',
  },
  features: {},
  metadata: {},
};

export class PlatformSettingsEngine {
  static createDefaults(tenantId: string): TenantPlatformSettings {
    return structuredClone({ ...defaultSystemSettings, tenantId });
  }

  static applyPatch(
    current: TenantPlatformSettings,
    patch: TenantPlatformSettingsPatch,
  ): TenantPlatformSettings {
    return TenantPlatformSettingsSchema.parse({
      ...current,
      version: current.version + 1,
      branding: { ...current.branding, ...patch.branding },
      security: { ...current.security, ...patch.security },
      localization: { ...current.localization, ...patch.localization },
      features: { ...current.features, ...patch.features },
      metadata: { ...current.metadata, ...patch.metadata },
    });
  }
}
