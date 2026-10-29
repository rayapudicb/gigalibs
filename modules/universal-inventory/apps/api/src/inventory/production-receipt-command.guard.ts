import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const PRODUCTION_RECEIPT_COMMAND_CONFIG = Symbol('UNIVERSAL_INVENTORY_PRODUCTION_RECEIPT_COMMAND_CONFIG');
export const PRODUCTION_RECEIPT_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-production-receipt-command';

export function loadProductionReceiptCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'INVENTORY_PRODUCTION_RECEIPT_COMMAND_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_PRODUCTION_RECEIPT_COMMAND_UNUSED_RELAY_URL',
    signingKey: 'INVENTORY_PRODUCTION_RECEIPT_COMMAND_UNUSED_SIGNING_KEY',
    interval: 'INVENTORY_PRODUCTION_RECEIPT_COMMAND_UNUSED_INTERVAL_MS',
    peerService: 'universal-manufacturing',
  });
}

@Injectable()
export class ProductionReceiptCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(PRODUCTION_RECEIPT_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: PRODUCTION_RECEIPT_COMMAND_AUDIENCE,
      source: 'universal-manufacturing',
      label: 'Universal Inventory production receipt',
    });
  }
}
