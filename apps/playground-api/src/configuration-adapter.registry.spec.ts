import type { DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import {
  CONFIGURATION_ADAPTERS,
  ConfigurationAdapterRegistry,
  defaultConfigurationAdapters,
} from './configuration-adapter.registry.js';
import { TenantProfileConfigurationAdapterV1 } from './tenant-profile-configuration.adapter.js';

describe('ConfigurationAdapterRegistry', () => {
  it('resolves only the exact module, entity and surface identity', () => {
    const registry = new ConfigurationAdapterRegistry();

    expect(
      registry.descriptor('tenant-settings', 'tenant-profile', 'profile-extension'),
    ).toMatchObject({
      adapterKey: 'tenant-profile-v1',
      entitlementModuleKey: 'tenant-access',
    });
    expect(
      registry.descriptor('tenant-settings', 'tenant-profile', 'other-surface'),
    ).toBeUndefined();
    expect(
      registry.descriptor('other-module', 'tenant-profile', 'profile-extension'),
    ).toBeUndefined();
  });

  it('rejects duplicate exact-key registrations at startup', () => {
    expect(
      () =>
        new ConfigurationAdapterRegistry([
          new TenantProfileConfigurationAdapterV1(),
          new TenantProfileConfigurationAdapterV1(),
        ]),
    ).toThrow('Duplicate configuration adapter registration');
  });

  it('returns deeply immutable descriptor copies', () => {
    const registry = new ConfigurationAdapterRegistry();
    const descriptor = registry.descriptor(
      'tenant-settings',
      'tenant-profile',
      'profile-extension',
    );

    expect(descriptor).toBeDefined();
    expect(Object.isFrozen(descriptor)).toBe(true);
    expect(Object.isFrozen(descriptor?.surface.coreFields)).toBe(true);
    expect(() => descriptor?.surface.coreFields.push(descriptor.surface.coreFields[0]!)).toThrow();
    expect(
      registry.descriptor('tenant-settings', 'tenant-profile', 'profile-extension')?.surface
        .coreFields,
    ).toHaveLength(4);
  });

  it('resolves its adapter collection through an explicit Nest injection token', async () => {
    class ConfigurationAdapterRegistryTestModule {}
    const moduleDefinition: DynamicModule = {
      module: ConfigurationAdapterRegistryTestModule,
      providers: [
        { provide: CONFIGURATION_ADAPTERS, useFactory: defaultConfigurationAdapters },
        ConfigurationAdapterRegistry,
      ],
    };
    const context = await NestFactory.createApplicationContext(moduleDefinition, {
      logger: false,
    });

    try {
      const descriptors = context.get(ConfigurationAdapterRegistry).descriptors();
      expect(descriptors).toHaveLength(5);
      expect(descriptors.some((d) => d.adapterKey === 'party-profile-v1')).toBe(true);
      expect(descriptors.some((d) => d.adapterKey === 'universal-procurement-v1')).toBe(true);
    } finally {
      await context.close();
    }
  });
});
