import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  FINANCE_INBOX_AUDIENCE,
  MANUFACTURING_FINANCE_RELAY_CONFIG,
  type ManufacturingFinanceRelayConfig,
} from './relay-config.js';

@Injectable()
export class ManufacturingFinanceOutboxRelay extends OutboxRelay<
  'relay_lease_manufacturing_events' | 'relay_settle_manufacturing_event'
> {
  constructor(database: DatabaseService, @Inject(MANUFACTURING_FINANCE_RELAY_CONFIG) config: ManufacturingFinanceRelayConfig) {
    super(database, config, {
      leaseFunction: 'relay_lease_manufacturing_events',
      settleFunction: 'relay_settle_manufacturing_event',
      audience: FINANCE_INBOX_AUDIENCE,
      source: 'universal-manufacturing',
      notConfiguredMessage:
        'Outbox relay to Finance is not configured; production completion events stay in the outbox.',
    });
  }
}
