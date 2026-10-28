import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const RESERVE_RELEASE_COMMAND_CONFIG = Symbol('UNIVERSAL_INVENTORY_RESERVE_RELEASE_COMMAND_CONFIG');
export const RESERVE_RELEASE_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-reserve-release-command';

export function loadReserveReleaseCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'INVENTORY_RESERVE_RELEASE_COMMAND_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_RESERVE_RELEASE_COMMAND_UNUSED_RELAY_URL',
    signingKey: 'INVENTORY_RESERVE_RELEASE_COMMAND_UNUSED_SIGNING_KEY',
    interval: 'INVENTORY_RESERVE_RELEASE_COMMAND_UNUSED_INTERVAL_MS',
    peerService: 'universal-orders',
  });
}

@Injectable()
export class ReserveReleaseCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(RESERVE_RELEASE_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: RESERVE_RELEASE_COMMAND_AUDIENCE,
      source: 'universal-orders',
      label: 'Universal Inventory reserve/release',
    });
  }
}
