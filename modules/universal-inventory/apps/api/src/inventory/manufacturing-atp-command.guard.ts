import { RelayInboxGuardBase, loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const MANUFACTURING_ATP_COMMAND_CONFIG = Symbol('INVENTORY_MANUFACTURING_ATP_COMMAND_CONFIG');
export const MANUFACTURING_ATP_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-manufacturing-atp-command';

export function loadManufacturingAtpCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'INVENTORY_MANUFACTURING_RESERVE_COMMAND_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_MANUFACTURING_ATP_UNUSED_URL',
    signingKey: 'INVENTORY_MANUFACTURING_ATP_UNUSED_KEY',
    interval: 'INVENTORY_MANUFACTURING_ATP_UNUSED_INTERVAL',
    peerService: 'universal-manufacturing',
  });
}

@Injectable()
export class ManufacturingAtpCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(MANUFACTURING_ATP_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: MANUFACTURING_ATP_COMMAND_AUDIENCE,
      source: 'universal-manufacturing',
      label: 'Universal Inventory manufacturing ATP',
    });
  }
}
