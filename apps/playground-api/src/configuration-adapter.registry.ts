import type {
  ConfigurationSurfaceRegistration,
  ModuleAdapterDescriptorV1,
} from '@gigalibs/contracts';
import { Inject, Injectable } from '@nestjs/common';
import {
  type ModuleConfigurationAdapterV1,
  TenantProfileConfigurationAdapterV1,
} from './tenant-profile-configuration.adapter.js';
import { PartyConfigurationAdapterV1 } from './parties/party-configuration.adapter.js';
import { ProductConfigurationAdapterV1 } from './catalogue/product-configuration.adapter.js';
import { InventoryConfigurationAdapterV1 } from './inventory/inventory-configuration.adapter.js';
import { ProcurementConfigurationAdapterV1 } from './procurement/procurement-configuration.adapter.js';
import { OrderConfigurationAdapterV1 } from './orders/order-configuration.adapter.js';
import { FinancialConfigurationAdapterV1 } from './finance/financial-configuration.adapter.js';

export const CONFIGURATION_ADAPTERS = Symbol('CONFIGURATION_ADAPTERS');

export function defaultConfigurationAdapters(): readonly ModuleConfigurationAdapterV1[] {
  return Object.freeze([
    new TenantProfileConfigurationAdapterV1(),
    new PartyConfigurationAdapterV1(),
    new ProductConfigurationAdapterV1(),
    new InventoryConfigurationAdapterV1(),
    new ProcurementConfigurationAdapterV1(),
    new OrderConfigurationAdapterV1(),
    new FinancialConfigurationAdapterV1(),
  ]);
}

@Injectable()
export class ConfigurationAdapterRegistry {
  private readonly adapters = new Map<string, ModuleConfigurationAdapterV1>();

  constructor(
    @Inject(CONFIGURATION_ADAPTERS)
    adapters: readonly ModuleConfigurationAdapterV1[] = defaultConfigurationAdapters(),
  ) {
    for (const adapter of adapters) {
      const key = descriptorKey(adapter.descriptor);
      if (this.adapters.has(key)) {
        throw new Error(`Duplicate configuration adapter registration for ${key}.`);
      }
      this.adapters.set(key, adapter);
    }
  }

  descriptor(moduleKey: string, entityKey: string, surfaceKey: string) {
    const descriptor = this.adapters.get(
      descriptorKey({ moduleKey, entityKey, surfaceKey }),
    )?.descriptor;
    return descriptor ? immutableCopy(descriptor) : undefined;
  }

  descriptors(): readonly ModuleAdapterDescriptorV1[] {
    return Object.freeze(
      [...this.adapters.values()]
        .map((adapter) => immutableCopy(adapter.descriptor))
        .sort((left, right) => descriptorKey(left).localeCompare(descriptorKey(right))),
    );
  }

  surfaces(): readonly ConfigurationSurfaceRegistration[] {
    return Object.freeze(this.descriptors().map((descriptor) => descriptor.surface));
  }

  validatesExtensionOwner(tenantId: string, ownerType: string, ownerId: string): boolean {
    const adapter = [...this.adapters.values()].find((candidate) =>
      candidate.ownsExtensionOwner(ownerType),
    );
    return adapter?.validatesExtensionOwner(tenantId, ownerType, ownerId) ?? false;
  }
}

function descriptorKey(
  input: Pick<ModuleAdapterDescriptorV1, 'moduleKey' | 'entityKey' | 'surfaceKey'>,
) {
  return `${input.moduleKey}\u0000${input.entityKey}\u0000${input.surfaceKey}`;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
