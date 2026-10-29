import { OutboxRelay, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  AR_PROJECTS_INBOX_AUDIENCE,
  PROJECT_AR_RELAY_CONFIG,
  loadProjectArRelayConfig,
} from './relay-config.js';

@Injectable()
export class ProjectArOutboxRelay extends OutboxRelay<
  'relay_lease_project_ar_events' | 'relay_settle_project_event'
> {
  constructor(database: DatabaseService, @Inject(PROJECT_AR_RELAY_CONFIG) config: RelayConfig) {
    super(database, config ?? loadProjectArRelayConfig(), {
      leaseFunction: 'relay_lease_project_ar_events',
      settleFunction: 'relay_settle_project_event',
      audience: AR_PROJECTS_INBOX_AUDIENCE,
      source: 'project-operations',
      notConfiguredMessage: 'Project Operations to AR relay is not configured; billing drafts remain in the outbox.',
    });
  }
}
