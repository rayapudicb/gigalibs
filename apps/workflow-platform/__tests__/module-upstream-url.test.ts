/**
 * WI-OI-085e — gateway targets: the module's exact origin plus its base path (empty for a module running as its own
 * service), with encoded segments and no way to climb out of the base path.
 */
import { describe, expect, it, vi } from 'vitest';
import { generatedModuleUpstreams } from '../lib/generated/module-upstreams';
import { localModuleUpstreamUrl } from '../lib/local-module-upstream';

// The repository has no hosted module yet, so one is added to the generated table the way the generator writes it.
vi.mock('../lib/generated/module-upstreams', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/generated/module-upstreams')>();
  return {
    ...actual,
    generatedModuleUpstreams: {
      ...actual.generatedModuleUpstreams,
      'field-inspections': {
        module: 'field-inspections',
        environmentKey: 'FIELD_INSPECTIONS_API_URL',
        port: '4790',
        serviceHostname: 'module-host',
        basePath: '/field-inspections',
      },
    },
  };
});

const environment = {
  CMMS_API_URL: 'http://cmms-api:4200',
  FIELD_INSPECTIONS_API_URL: 'http://module-host:4790',
};
const hosted = 'field-inspections' as keyof typeof generatedModuleUpstreams;

describe('module upstream URLs', () => {
  it('keeps service modules at their origin with no base path', () => {
    expect(generatedModuleUpstreams.cmms.basePath).toBe('');
    expect(localModuleUpstreamUrl('cmms', ['v1', 'work-orders'], environment).href).toBe(
      'http://cmms-api:4200/v1/work-orders',
    );
  });

  it('puts a hosted module under its base path in the shared module host', () => {
    expect(localModuleUpstreamUrl(hosted, ['v1', 'records'], environment).href).toBe(
      'http://module-host:4790/field-inspections/v1/records',
    );
    expect(localModuleUpstreamUrl(hosted, ['v1', '%2e%2e', 'x'], environment).pathname).toBe(
      '/field-inspections/v1/%252e%252e/x',
    );
    expect(() => localModuleUpstreamUrl(hosted, ['..', 'site-visits', 'v1'], environment)).toThrow('dot segments');
  });

  it('encodes each segment', () => {
    expect(localModuleUpstreamUrl('cmms', ['v1', 'a b', 'c/d'], environment).pathname).toBe('/v1/a%20b/c%2Fd');
  });

  it.each([['..'], ['.'], ['']])('refuses the segment %j', (segment) => {
    expect(() => localModuleUpstreamUrl('cmms', ['v1', segment, 'x'], environment)).toThrow('dot segments');
  });
});
