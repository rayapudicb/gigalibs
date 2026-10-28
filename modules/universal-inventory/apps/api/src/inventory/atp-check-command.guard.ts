import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const ATP_CHECK_COMMAND_CONFIG = Symbol('UNIVERSAL_INVENTORY_ATP_CHECK_COMMAND_CONFIG');
export const ATP_CHECK_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-atp-check-command';

export function loadAtpCheckCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'INVENTORY_ATP_COMMAND_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_ATP_COMMAND_UNUSED_RELAY_URL',
    signingKey: 'INVENTORY_ATP_COMMAND_UNUSED_SIGNING_KEY',
    interval: 'INVENTORY_ATP_COMMAND_UNUSED_INTERVAL_MS',
    peerService: 'universal-orders',
  });
}

@Injectable()
export class AtpCheckCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(ATP_CHECK_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: ATP_CHECK_COMMAND_AUDIENCE,
      source: 'universal-orders',
      label: 'Universal Inventory ATP check',
    });
  }
}
