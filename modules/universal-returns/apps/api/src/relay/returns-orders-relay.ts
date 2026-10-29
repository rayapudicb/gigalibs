import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { ORDERS_RETURNS_RMA_INBOX_AUDIENCE, RETURNS_ORDERS_RELAY_CONFIG, loadReturnsOrdersRelayConfig } from './relay-config.js';
import type { RelayConfig } from '@gigalibs/module-sdk';

@Injectable()
export class ReturnsOrdersOutboxRelay extends OutboxRelay<
  'relay_lease_returns_orders_events' | 'relay_settle_returns_event'
> {
  constructor(database: DatabaseService, @Inject(RETURNS_ORDERS_RELAY_CONFIG) config: RelayConfig) {
    super(database, config ?? loadReturnsOrdersRelayConfig(), {
      leaseFunction: 'relay_lease_returns_orders_events',
      settleFunction: 'relay_settle_returns_event',
      audience: ORDERS_RETURNS_RMA_INBOX_AUDIENCE,
      source: 'universal-returns',
      notConfiguredMessage: 'Returns to Orders relay is not configured; credit-memo requests remain in the outbox.',
    });
  }
}
