/**
 * WI-OI-153 slice B (ADR-0038 §2, §5): the workspace profile on Settings › General & localization is saved to the
 * workspace's own versioned settings, and choosing a country suggests its time zone and first day of the week.
 */
import { describe, expect, it } from 'vitest';
import { countrySuggestions, localizationPatch } from '../components/settings/TenantLocalizationSettings';

describe('workspace profile on the Localization screen', () => {
  const draft = { defaultLocale: 'en-IN', defaultCurrency: 'INR', timezone: 'Asia/Kolkata', dateFormat: 'dd/MM/yyyy' };

  it("saves the profile against the version it read, in the settings API's update shape (validated in @gigalibs/platform-settings)", () => {
    const patch = localizationPatch({ ...draft, countryCode: 'IN', weekStart: 1, fiscalYearStartMonth: 4 }, 7);
    expect(patch).toEqual({
      expectedVersion: 7,
      localization: { defaultLocale: 'en-IN', defaultCurrency: 'INR', timezone: 'Asia/Kolkata', countryCode: 'IN', weekStart: 1, fiscalYearStartMonth: 4 },
    });
  });

  it('leaves out profile fields that are not set, so an older workspace saves unchanged', () => {
    expect(localizationPatch(draft, 1).localization).toEqual({ defaultLocale: 'en-IN', defaultCurrency: 'INR', timezone: 'Asia/Kolkata' });
  });

  it('suggests a single-zone country its time zone and week start, and offers the zones of a multi-zone country', () => {
    const india = countrySuggestions('IN');
    expect(india.timeZones).toHaveLength(1);
    expect(india.weekStart).toBe(7);
    expect(countrySuggestions('US').timeZones.length).toBeGreaterThan(1);
    expect(countrySuggestions('??').timeZones).toEqual([]);
  });
});
