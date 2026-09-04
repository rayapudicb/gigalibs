import { describe, expect, it } from 'vitest';
import { ModuleRegistry, ModuleRegistryError, type ModuleManifest } from './index.js';

const manifest = (id: string, version = '1.0.0', requires = {}): ModuleManifest => ({
  id,
  name: id,
  version,
  description: `${id} module`,
  capabilities: [],
  requires,
  optional: {},
  permissions: [],
  eventsProduced: [],
  eventsConsumed: [],
  healthChecks: [],
});

describe('ModuleRegistry', () => {
  it('orders dependencies before consumers', () => {
    const registry = new ModuleRegistry([
      manifest('gigalibs.tenancy', '1.0.0', { 'gigalibs.kernel': '^1.0.0' }),
      manifest('gigalibs.kernel'),
    ]);

    registry.assertReady();
    expect(registry.list().map((item) => item.manifest.id)).toEqual([
      'gigalibs.kernel',
      'gigalibs.tenancy',
    ]);
  });

  it('rejects missing required modules', () => {
    const registry = new ModuleRegistry([
      manifest('gigalibs.tenancy', '1.0.0', { 'gigalibs.kernel': '^1.0.0' }),
    ]);

    expect(() => registry.assertReady()).toThrowError(ModuleRegistryError);
    expect(registry.list()[0]?.status).toBe('BLOCKED');
  });

  it('rejects incompatible versions', () => {
    const registry = new ModuleRegistry([
      manifest('gigalibs.kernel', '2.0.0'),
      manifest('gigalibs.tenancy', '1.0.0', { 'gigalibs.kernel': '^1.0.0' }),
    ]);

    expect(() => registry.assertReady()).toThrow(/requires 'gigalibs.kernel'/);
  });

  it('rejects dependency cycles', () => {
    const registry = new ModuleRegistry([
      manifest('gigalibs.first', '1.0.0', { 'gigalibs.second': '^1.0.0' }),
      manifest('gigalibs.second', '1.0.0', { 'gigalibs.first': '^1.0.0' }),
    ]);

    expect(() => registry.assertReady()).toThrow(/cycle/i);
  });
});
