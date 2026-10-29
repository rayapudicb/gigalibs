import { ORDERS_RETURNS_RMA_INBOX_AUDIENCE } from '@gigalibs/contracts';
import { RelayInboxGuardBase, loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const ORDERS_RETURNS_RMA_INBOX_CONFIG = Symbol('ORDERS_RETURNS_RMA_INBOX_CONFIG');

export function loadOrdersReturnsRmaInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ORDERS_RETURNS_RMA_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'ORDERS_RETURNS_RMA_INBOX_UNUSED_URL',
    signingKey: 'ORDERS_RETURNS_RMA_INBOX_UNUSED_KEY',
    interval: 'ORDERS_RETURNS_RMA_INBOX_UNUSED_INTERVAL',
    peerService: 'universal-returns',
  });
}

@Injectable()
export class OrdersReturnsRmaInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ORDERS_RETURNS_RMA_INBOX_CONFIG) config: RelayConfig) {
    super(config, {
      audience: ORDERS_RETURNS_RMA_INBOX_AUDIENCE,
      source: 'universal-returns',
      label: 'Orders Returns RMA',
    });
  }
}
