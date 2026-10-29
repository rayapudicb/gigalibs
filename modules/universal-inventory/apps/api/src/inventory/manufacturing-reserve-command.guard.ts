import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const MANUFACTURING_RESERVE_COMMAND_CONFIG = Symbol('INVENTORY_MANUFACTURING_RESERVE_COMMAND_CONFIG');
export const MANUFACTURING_RESERVE_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-manufacturing-reserve-command';

export function loadManufacturingReserveCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'INVENTORY_MANUFACTURING_RESERVE_COMMAND_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_MANUFACTURING_RESERVE_COMMAND_UNUSED_URL',
    signingKey: 'INVENTORY_MANUFACTURING_RESERVE_COMMAND_UNUSED_KEY',
    interval: 'INVENTORY_MANUFACTURING_RESERVE_COMMAND_UNUSED_INTERVAL',
    peerService: 'universal-manufacturing',
  });
}

@Injectable()
export class ManufacturingReserveCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(MANUFACTURING_RESERVE_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: MANUFACTURING_RESERVE_COMMAND_AUDIENCE,
      source: 'universal-manufacturing',
      label: 'Universal Inventory manufacturing reserve/release',
    });
  }
}
