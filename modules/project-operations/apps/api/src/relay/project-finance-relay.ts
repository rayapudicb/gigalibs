import { OutboxRelay, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  FINANCE_PROJECTS_INBOX_AUDIENCE,
  PROJECT_FINANCE_RELAY_CONFIG,
  loadProjectFinanceRelayConfig,
} from './relay-config.js';

@Injectable()
export class ProjectFinanceOutboxRelay extends OutboxRelay<
  'relay_lease_project_finance_events' | 'relay_settle_project_event'
> {
  constructor(database: DatabaseService, @Inject(PROJECT_FINANCE_RELAY_CONFIG) config: RelayConfig) {
    super(database, config ?? loadProjectFinanceRelayConfig(), {
      leaseFunction: 'relay_lease_project_finance_events',
      settleFunction: 'relay_settle_project_event',
      audience: FINANCE_PROJECTS_INBOX_AUDIENCE,
      source: 'project-operations',
      notConfiguredMessage: 'Project Operations to Finance relay is not configured; WIP accruals remain in the outbox.',
    });
  }
}
