import { describe, expect, it, vi } from 'vitest';
import {
  ConfigurationManifestCache,
  type ConfigurationManifestProjection,
  type ConfigurationManifestScope,
} from './configuration-manifest.cache.js';

const scope: ConfigurationManifestScope = {
  tenantId: 'tenant_01',
  moduleKey: 'tenant-apps',
  entityKey: 'invoice',
  surfaceKey: 'invoice-form',
  environmentKey: 'production',
  cohortKey: 'all-users',
};

function projection(id: string): ConfigurationManifestProjection {
  return {
    activationId: `activation_${id}`,
    publishedVersionId: `version_${id}`,
    activatedAt: new Date('2026-09-16T00:00:00.000Z'),
    manifest: { checksum: `checksum_${id}` } as never,
    checksum: `checksum_${id}`,
  };
}

describe('ConfigurationManifestCache', () => {
  it('bypasses cached values while the invalidation listener is disconnected', async () => {
    const cache = new ConfigurationManifestCache();
    const load = vi.fn().mockResolvedValue(projection('one'));

    await cache.read(scope, load);
    await cache.read(scope, load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.snapshot()).toMatchObject({ listenerConnected: false, bypass: 2, hit: 0 });
  });

  it('serves a bounded connected cache and invalidates an exact scope', async () => {
    const cache = new ConfigurationManifestCache();
    cache.markListenerConnected();
    const load = vi
      .fn<() => Promise<ConfigurationManifestProjection>>()
      .mockResolvedValueOnce(projection('one'))
      .mockResolvedValueOnce(projection('two'));

    expect((await cache.read(scope, load)).activationId).toBe('activation_one');
    expect((await cache.read(scope, load)).activationId).toBe('activation_one');
    cache.invalidate(scope);
    expect((await cache.read(scope, load)).activationId).toBe('activation_two');

    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.snapshot()).toMatchObject({ entries: 1, miss: 2, hit: 1 });
  });

  it('coalesces concurrent authoritative loads and fences an invalidated load', async () => {
    const cache = new ConfigurationManifestCache();
    cache.markListenerConnected();
    let resolveLoad!: (value: ConfigurationManifestProjection) => void;
    const load = vi.fn(
      () =>
        new Promise<ConfigurationManifestProjection>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = cache.read(scope, load);
    const second = cache.read(scope, load);
    cache.invalidate(scope);
    resolveLoad(projection('stale'));

    await expect(first).resolves.toMatchObject({ activationId: 'activation_stale' });
    await expect(second).resolves.toMatchObject({ activationId: 'activation_stale' });
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.snapshot().entries).toBe(0);
  });

  it('authoritatively resynchronizes existing scopes before reconnect use', async () => {
    const cache = new ConfigurationManifestCache();
    cache.markListenerConnected();
    await cache.read(scope, async () => projection('one'));
    cache.markListenerDisconnected();
    await cache.resynchronizeAll(async () => projection('two'));
    cache.markListenerConnected();

    const load = vi.fn().mockResolvedValue(projection('unexpected'));
    expect((await cache.read(scope, load)).activationId).toBe('activation_two');
    expect(load).not.toHaveBeenCalled();
    expect(cache.snapshot()).toMatchObject({ resynchronizationSucceeded: 1, hit: 1 });
  });
});
