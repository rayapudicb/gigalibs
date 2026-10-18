import { describe, expect, it } from 'vitest';
import { platformModuleCatalog } from '../modules/index.js';
import { moduleWindowBaselines, moduleWindowEntitlementKey } from './window-baselines.js';

// WI-OI-120bh (corrects WI-OI-120bf): a module's windows are brought by its catalogue entitlement, which the manifest
// names, never by a module key written into code. CMMS ships from `physical-operations-cmms` and is `asset-maintenance`.
describe('the entitlement that brings each module window', () => {
  it('is a real catalogue entry for every shipped window', () => {
    const catalogue = new Set(platformModuleCatalog.map((entry) => entry.key));
    for (const baseline of moduleWindowBaselines()) {
      expect(catalogue.has(moduleWindowEntitlementKey(baseline.definition.moduleKey))).toBe(true);
    }
  });

  it('is the CMMS catalogue entry for the CMMS windows', () => {
    expect(moduleWindowEntitlementKey('physical-operations-cmms')).toBe('asset-maintenance');
  });

  it('refuses a module that ships no window, rather than guessing', () => {
    expect(() => moduleWindowEntitlementKey('not-a-module')).toThrow(/ships no window/);
    expect(() => moduleWindowEntitlementKey('constructor')).toThrow(/ships no window/);
  });
});
