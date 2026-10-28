import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const ORDERS_FULFILLMENT_INBOX_CONFIG = Symbol('AR_ORDERS_FULFILLMENT_INBOX_CONFIG');
export const ORDERS_FULFILLMENT_INBOX_AUDIENCE = 'gigalibs-ar-orders-inbox';

export function loadOrdersFulfillmentInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'AR_ORDERS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'AR_ORDERS_UNUSED_RELAY_URL',
    signingKey: 'AR_ORDERS_UNUSED_RELAY_KEY',
    interval: 'AR_ORDERS_RELAY_INTERVAL_MS',
    peerService: 'module-host',
  });
}

@Injectable()
export class OrdersFulfillmentInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(ORDERS_FULFILLMENT_INBOX_CONFIG) config: RelayConfig) {
    super(config, { audience: ORDERS_FULFILLMENT_INBOX_AUDIENCE, source: 'orders', label: 'AR fulfillment' });
  }
}
