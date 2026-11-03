import { describe, expect, it } from 'vitest';
import { PlatformSettingsEngine, TenantPlatformSettingsPatchSchema, TenantPlatformSettingsSchema } from './index.js';

describe('PlatformSettingsEngine', () => {
  it('creates isolated defaults for each tenant', () => {
    const first = PlatformSettingsEngine.createDefaults('tenant-a');
    const second = PlatformSettingsEngine.createDefaults('tenant-b');
    first.features.billing = true;

    expect(second.features.billing).toBeUndefined();
    expect(second.tenantId).toBe('tenant-b');
  });

  it('merges a patch and increments the version', () => {
    const current = PlatformSettingsEngine.createDefaults('tenant-a');
    const next = PlatformSettingsEngine.applyPatch(current, {
      expectedVersion: 1,
      branding: { appName: 'Acme' },
    });

    expect(next.version).toBe(2);
    expect(next.branding.appName).toBe('Acme');
    expect(next.branding.primaryColor).toBe('#2563eb');
  });

  it('requires an audit reason for security policy changes', () => {
    expect(
      TenantPlatformSettingsPatchSchema.safeParse({
        expectedVersion: 1,
        security: { enforceMfa: true },
      }).success,
    ).toBe(false);
    expect(
      TenantPlatformSettingsPatchSchema.safeParse({
        expectedVersion: 1,
        security: { enforceMfa: true },
        changeReason: 'Require a second factor for tenant sessions',
      }).success,
    ).toBe(true);
  });
});

describe('workspace profile in localization (WI-OI-153)', () => {
  const base = { expectedVersion: 1 };
  it('accepts a real country, currency and time zone, and the optional profile fields', () => {
    const parsed = TenantPlatformSettingsPatchSchema.safeParse({
      ...base,
      localization: { countryCode: 'IN', defaultCurrency: 'INR', timezone: 'Asia/Kolkata', weekStart: 1, fiscalYearStartMonth: 4, industryKey: 'manufacturing' },
    });
    expect(parsed.success).toBe(true);
  });
  it('refuses unknown codes with a plain message', () => {
    const parsed = TenantPlatformSettingsPatchSchema.safeParse({
      ...base,
      localization: { countryCode: 'QQ', defaultCurrency: 'XYZ', timezone: 'Mars/Olympus' },
    });
    expect(parsed.success).toBe(false);
    const paths = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['localization.countryCode', 'localization.defaultCurrency', 'localization.timezone']));
  });
  it('still reads a workspace saved before the profile existed', () => {
    const settings = PlatformSettingsEngine.createDefaults('t1');
    expect(TenantPlatformSettingsSchema.parse(settings).localization.countryCode).toBeUndefined();
  });
});

describe('workspace profile at creation (WI-OI-153)', () => {
  it('replaces the localization defaults with the chosen profile', () => {
    const settings = PlatformSettingsEngine.createDefaults('t1', { countryCode: 'JP', defaultCurrency: 'JPY', timezone: 'Asia/Tokyo' });
    expect(settings.localization).toMatchObject({ countryCode: 'JP', defaultCurrency: 'JPY', timezone: 'Asia/Tokyo', defaultLocale: 'en-US' });
  });
  it('names the first problem of an unusable profile, and none for a good or absent one', () => {
    expect(PlatformSettingsEngine.profileProblem({ defaultCurrency: 'XYZ' })).toBe('Choose a currency from the list.');
    expect(PlatformSettingsEngine.profileProblem({ countryCode: 'IN', defaultCurrency: 'INR' })).toBeNull();
    expect(PlatformSettingsEngine.profileProblem(undefined)).toBeNull();
  });
});

