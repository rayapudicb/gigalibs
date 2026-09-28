import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigurationRuntimeScopeResolver } from './configuration-runtime-scope.resolver.js';

describe('ConfigurationRuntimeScopeResolver', () => {
  const originalEnvironment = process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY;

  beforeEach(() => {
    process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY = 'local-uat';
  });

  afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY;
    else process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY = originalEnvironment;
  });

  it('resolves the server-owned all-entitled-users policy', () => {
    expect(new ConfigurationRuntimeScopeResolver().resolve('tenant-access')).toEqual({
      contractVersion: '1.0',
      environmentKey: 'local-uat',
      cohortKey: 'all-users',
      policyKey: 'ALL_ENTITLED_USERS_V1',
      entitlementModuleKey: 'tenant-access',
      resolutionSource: 'SERVER_POLICY',
    });
  });

  it('fails closed when the required environment is absent', () => {
    delete process.env.CONFIGURATION_RUNTIME_ENVIRONMENT_KEY;

    expect(() => new ConfigurationRuntimeScopeResolver().onModuleInit()).toThrow(
      'Runtime configuration is unavailable.',
    );
  });

  it('rejects a mismatched legacy client assertion', () => {
    const resolver = new ConfigurationRuntimeScopeResolver();
    const scope = resolver.resolve('tenant-access');

    expect(() => resolver.assertLegacyAssertions(scope, { environmentKey: 'production' })).toThrow(
      'The requested runtime scope is not available.',
    );
  });
});
