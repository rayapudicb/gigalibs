import { OutboxRelay, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  FINANCE_RETURNS_INBOX_AUDIENCE,
  RETURNS_FINANCE_RELAY_CONFIG,
  loadReturnsFinanceRelayConfig,
} from './relay-config.js';

@Injectable()
export class ReturnsFinanceOutboxRelay extends OutboxRelay<
  'relay_lease_returns_finance_events' | 'relay_settle_returns_event'
> {
  constructor(database: DatabaseService, @Inject(RETURNS_FINANCE_RELAY_CONFIG) config: RelayConfig) {
    super(database, config ?? loadReturnsFinanceRelayConfig(), {
      leaseFunction: 'relay_lease_returns_finance_events',
      settleFunction: 'relay_settle_returns_event',
      audience: FINANCE_RETURNS_INBOX_AUDIENCE,
      source: 'universal-returns',
      notConfiguredMessage: 'Returns to Finance relay is not configured; scrap GL requests remain in the outbox.',
    });
  }
}
