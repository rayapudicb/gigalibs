import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  FINANCE_INVENTORY_OUTBOUND_CONFIG,
  INVENTORY_INBOX_AUDIENCE,
  type FinanceInventoryOutboundConfig,
} from './relay-config.js';

@Injectable()
export class FinanceInventoryOutboxRelay extends OutboxRelay<
  'relay_lease_finance_inventory_events' | 'relay_settle_finance_event'
> {
  constructor(
    database: DatabaseService,
    @Inject(FINANCE_INVENTORY_OUTBOUND_CONFIG) config: FinanceInventoryOutboundConfig,
  ) {
    super(database, config, {
      leaseFunction: 'relay_lease_finance_inventory_events',
      settleFunction: 'relay_settle_finance_event',
      audience: INVENTORY_INBOX_AUDIENCE,
      source: 'finance',
      notConfiguredMessage:
        'Outbox relay to Inventory is not configured; posting outcomes and fiscal period updates stay in the outbox.',
    });
  }
}
