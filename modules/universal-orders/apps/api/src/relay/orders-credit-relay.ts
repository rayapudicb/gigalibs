import { OutboxRelay, loadRelayConfig } from '@gigalibs/module-sdk';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export function loadOrdersCreditRelayConfig(environment: NodeJS.ProcessEnv = process.env) {
  const env = { ...environment };
  if (env.ORDERS_CREDIT_RELAY_URL?.trim() && !env.ORDERS_CREDIT_RELAY_INBOX_PATH?.trim()) {
    env.ORDERS_CREDIT_RELAY_INBOX_PATH = '/business-partners/internal/v1/credit-inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'ORDERS_CREDIT_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'ORDERS_CREDIT_RELAY_URL',
    signingKey: 'ORDERS_CREDIT_RELAY_PRIVATE_KEY_BASE64',
    interval: 'ORDERS_CREDIT_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'ORDERS_CREDIT_RELAY_INBOX_PATH',
  });
}

@Injectable()
export class OrdersCreditUninvoicedRelay extends OutboxRelay<
  'relay_lease_credit_uninvoiced' | 'relay_settle_credit_uninvoiced'
> {
  constructor(database: DatabaseService) {
    super(database, loadOrdersCreditRelayConfig(), {
      leaseFunction: 'relay_lease_credit_uninvoiced',
      settleFunction: 'relay_settle_credit_uninvoiced',
      audience: 'gigalibs-business-partners-credit-inbox',
      source: 'universal-orders',
      notConfiguredMessage: 'Orders credit relay is not configured; uninvoiced balance facts remain queued.',
    });
  }
}
