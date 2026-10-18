import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { FINANCE_INBOX_AUDIENCE, INVENTORY_RELAY_CONFIG, type InventoryRelayConfig } from './relay-config.js';

@Injectable()
export class InventoryFinanceOutboxRelay extends OutboxRelay<
  'relay_lease_inventory_events' | 'relay_settle_inventory_event'
> {
  constructor(database: DatabaseService, @Inject(INVENTORY_RELAY_CONFIG) config: InventoryRelayConfig) {
    super(database, config, {
      leaseFunction: 'relay_lease_inventory_events',
      settleFunction: 'relay_settle_inventory_event',
      audience: FINANCE_INBOX_AUDIENCE,
      source: 'inventory',
      notConfiguredMessage: 'Outbox relay to Finance is not configured; receipt posting events stay in the outbox.',
    });
  }
}
