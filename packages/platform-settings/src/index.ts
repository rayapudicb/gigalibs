import { z } from 'zod';

export const WhiteLabelBrandingSchema = z.object({
  appName: z.string().min(1).max(100),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
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
  // WI-OI-153 slice B (ADR-0038 §2, §5): the workspace profile. Optional, so every existing workspace still reads; a
  // workspace without a country is asked to confirm it in the set-up guide.
  /** ISO 3166-1 alpha-2, for example IN, JP, US. */
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  /** The industry pack key, for example manufacturing. */
  industryKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/).optional(),
  /** First day of the week, 1 = Monday … 7 = Sunday (ISO 8601). */
  weekStart: z.number().int().min(1).max(7).optional(),
  /** Month the fiscal year starts, 1 = January … 12 = December. */
  fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
});

/** Whether a code is one the runtime's ICU knows (the same source as the platform reference sets). */
function supported(kind: 'currency' | 'timeZone', code: string): boolean {
  if (kind === 'timeZone') {
    // ICU lists CLDR canonical ids (Asia/Calcutta); formatting accepts every IANA name and alias (Asia/Kolkata, UTC).
    try {
      new Intl.DateTimeFormat('en', { timeZone: code });
      return true;
    } catch {
      return false;
    }
  }
  const values = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(kind);
  return !values || values.includes(code);
}
function knownRegion(code: string): boolean {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' }).of(code);
    return typeof name === 'string' && name !== code;
  } catch {
    return false;
  }
}

export const TenantPlatformSettingsSchema = z.object({
  tenantId: z.string(),
  version: z.number().int().positive(),
  branding: WhiteLabelBrandingSchema,
  security: SecurityPolicySettingsSchema,
  localization: LocalizationSettingsSchema,
  features: z.record(z.string(), z.boolean()),
  metadata: z.record(z.string(), z.unknown()),
});

export const TenantPlatformSettingsPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    branding: WhiteLabelBrandingSchema.partial().optional(),
    security: SecurityPolicySettingsSchema.partial().optional(),
    localization: LocalizationSettingsSchema.partial().optional(),
    features: z.record(z.string(), z.boolean()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    changeReason: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((patch, context) => {
    // WI-OI-153: a workspace profile names real codes, never free text.
    const localization = patch.localization;
    if (localization?.defaultCurrency !== undefined && !supported('currency', localization.defaultCurrency))
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['localization', 'defaultCurrency'], message: 'Choose a currency from the list.' });
    if (localization?.timezone !== undefined && !supported('timeZone', localization.timezone))
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['localization', 'timezone'], message: 'Choose a time zone from the list.' });
    if (localization?.countryCode !== undefined && !knownRegion(localization.countryCode))
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['localization', 'countryCode'], message: 'Choose a country from the list.' });
    if (patch.security && !patch.changeReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['changeReason'],
        message: 'A change reason is required for security policy updates',
      });
    }
  });

export type WhiteLabelBranding = z.infer<typeof WhiteLabelBrandingSchema>;
export type SecurityPolicySettings = z.infer<typeof SecurityPolicySettingsSchema>;
export type LocalizationSettings = z.infer<typeof LocalizationSettingsSchema>;
/** A workspace profile chosen at creation (WI-OI-153): any localization field, each may be left out. */
export type WorkspaceProfile = { readonly [Key in keyof LocalizationSettings]?: LocalizationSettings[Key] | undefined };
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

// biome-ignore lint/complexity/noStaticOnlyClass: retained public API for existing consumers.
export class PlatformSettingsEngine {
  /**
   * A new workspace's settings. WI-OI-153: a workspace profile chosen at creation (country, currency, language, time
   * zone, …) replaces the matching localization defaults; check it first with `profileProblem`.
   */
  static createDefaults(tenantId: string, profile?: WorkspaceProfile): TenantPlatformSettings {
    const defaults = structuredClone({ ...defaultSystemSettings, tenantId });
    if (!profile) return defaults;
    const chosen = Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined));
    return TenantPlatformSettingsSchema.parse({ ...defaults, localization: { ...defaults.localization, ...chosen } });
  }

  /** Why a workspace profile cannot be used (the same checks as a settings update), or null when it can. */
  static profileProblem(profile: WorkspaceProfile | undefined): string | null {
    if (!profile) return null;
    const parsed = TenantPlatformSettingsPatchSchema.safeParse({ expectedVersion: 1, localization: profile });
    return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'The workspace profile is not valid.');
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
