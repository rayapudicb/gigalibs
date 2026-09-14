import { describe, expect, it } from 'vitest';
import { PlatformSettingsEngine, TenantPlatformSettingsPatchSchema } from './index.js';

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
