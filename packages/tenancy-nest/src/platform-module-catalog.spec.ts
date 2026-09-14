import { describe, expect, it } from 'vitest';
import {
  assertEligibleModuleKeys,
  platformModuleCatalog,
  trialModuleKeys,
} from './platform-module-catalog.js';

describe('platform module catalog', () => {
  it('contains unique stable module keys', () => {
    const keys = platformModuleCatalog.map((module) => module.key);
    expect(new Set(keys).size).toBe(keys.length);
    const routes = platformModuleCatalog.map((module) => module.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('never grants contained or planned modules to a trial', () => {
    const trial = platformModuleCatalog.filter((module) => trialModuleKeys.includes(module.key));
    expect(trial.length).toBeGreaterThan(0);
    expect(trial.every((module) => module.trialEligible && module.entitlementEligible)).toBe(true);
    expect(
      trial.every((module) => module.readiness === 'AVAILABLE' || module.readiness === 'REVIEW'),
    ).toBe(true);
  });

  it('rejects an attempt to enable a contained module', () => {
    expect(() => assertEligibleModuleKeys(['enterprise-tax'])).toThrow(
      'Modules are not eligible for enablement',
    );
  });

  it('publishes one permission contract for every tenant-entitlement module', () => {
    expect(
      platformModuleCatalog
        .filter((module) => module.entitlementEligible)
        .every((module) => typeof module.requiredPermission === 'string'),
    ).toBe(true);
  });
});
