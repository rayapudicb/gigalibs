import { OutboxRelay, loadRelayConfig } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export const AR_ORDERS_INBOX_AUDIENCE = 'gigalibs-ar-orders-inbox';

export function loadOrdersArRelayConfig(environment: NodeJS.ProcessEnv = process.env) {
  const env = { ...environment };
  if (env.ORDERS_AR_RELAY_URL?.trim() && !env.ORDERS_AR_RELAY_INBOX_PATH?.trim()) {
    env.ORDERS_AR_RELAY_INBOX_PATH = '/internal/v1/orders-fulfillments';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'ORDERS_AR_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'ORDERS_AR_RELAY_URL',
    signingKey: 'ORDERS_AR_RELAY_PRIVATE_KEY_BASE64',
    interval: 'ORDERS_AR_RELAY_INTERVAL_MS',
    peerService: 'ar-api',
    inboxPath: 'ORDERS_AR_RELAY_INBOX_PATH',
  });
}

@Injectable()
export class OrdersArOutboxRelay extends OutboxRelay<'relay_lease_ar_fulfillments' | 'relay_settle_orders_event'> {
  constructor(database: DatabaseService) {
    super(database, loadOrdersArRelayConfig(), {
      leaseFunction: 'relay_lease_ar_fulfillments',
      settleFunction: 'relay_settle_orders_event',
      audience: AR_ORDERS_INBOX_AUDIENCE,
      source: 'orders',
      notConfiguredMessage: 'Orders to AR relay is not configured; fulfillment facts remain in the outbox.',
    });
  }
}
