import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { RMA_RETURN_RECEIPT_COMMAND_AUDIENCE } from '@gigalibs/contracts';

export const RMA_RETURN_RECEIPT_COMMAND_CONFIG = Symbol('UNIVERSAL_INVENTORY_RMA_RETURN_RECEIPT_COMMAND_CONFIG');

export function loadRmaReturnReceiptCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'INVENTORY_RMA_RETURN_RECEIPT_COMMAND_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_RMA_RETURN_RECEIPT_COMMAND_UNUSED_RELAY_URL',
    signingKey: 'INVENTORY_RMA_RETURN_RECEIPT_COMMAND_UNUSED_SIGNING_KEY',
    interval: 'INVENTORY_RMA_RETURN_RECEIPT_COMMAND_UNUSED_INTERVAL_MS',
    peerService: 'universal-returns',
  });
}

@Injectable()
export class RmaReturnReceiptCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(RMA_RETURN_RECEIPT_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: RMA_RETURN_RECEIPT_COMMAND_AUDIENCE,
      source: 'universal-returns',
      label: 'Universal Inventory RMA return receipt',
    });
  }
}
