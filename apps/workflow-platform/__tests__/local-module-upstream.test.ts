import { describe, expect, it } from 'vitest';
import { localModuleUpstreamOrigin } from '../lib/local-module-upstream';

describe('local module upstream boundary', () => {
  it('accepts exact Compose DNS origins', () => {
    expect(
      localModuleUpstreamOrigin('connector-hub', {
        CONNECTOR_HUB_API_URL: 'http://connector-hub-api:4100',
      }),
    ).toBe('http://connector-hub-api:4100');
    expect(
      localModuleUpstreamOrigin('analytics', {
        ANALYTICS_API_URL: 'http://analytics-api:4400',
      }),
    ).toBe('http://analytics-api:4400');
  });

  it('accepts exact loopback origins for direct local development', () => {
    expect(
      localModuleUpstreamOrigin('connector-hub', {
        CONNECTOR_HUB_API_URL: 'http://127.0.0.1:4100',
      }),
    ).toBe('http://127.0.0.1:4100');
    expect(
      localModuleUpstreamOrigin('analytics', {
        ANALYTICS_API_URL: 'http://localhost:4400',
      }),
    ).toBe('http://localhost:4400');
  });

  it.each([
    'https://analytics-api:4400',
    'http://analytics-api:4100',
    'http://example.com:4400',
    'http://user:password@analytics-api:4400',
    'http://analytics-api:4400/path',
    'http://analytics-api:4400/?target=http://example.com',
  ])('rejects an unsafe Analytics origin: %s', (value) => {
    expect(() =>
      localModuleUpstreamOrigin('analytics', { ANALYTICS_API_URL: value }),
    ).toThrow('Local module runtime rejected ANALYTICS_API_URL.');
  });

  it('fails closed when configuration is absent', () => {
    expect(() => localModuleUpstreamOrigin('connector-hub', {})).toThrow(
      'Local module runtime requires CONNECTOR_HUB_API_URL.',
    );
  });
});
