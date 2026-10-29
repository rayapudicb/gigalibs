import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import {
  ANALYTICS_INBOX_AUDIENCE,
  CMMS_ANALYTICS_RELAY_CONFIG,
  type CmmsAnalyticsRelayConfig,
} from './relay-config.js';

/**
 * WI-OI-130: relays `cmms.downtime.v1` outbox rows to the Analytics inbox for availability dashboards.
 */
@Injectable()
export class CmmsAnalyticsDowntimeRelay extends OutboxRelay<
  'relay_lease_analytics_downtime_events' | 'relay_settle_analytics_downtime_event' | 'outbox_sweep'
> {
  constructor(database: DatabaseService, @Inject(CMMS_ANALYTICS_RELAY_CONFIG) config: CmmsAnalyticsRelayConfig) {
    super(database, config, {
      leaseFunction: 'relay_lease_analytics_downtime_events',
      settleFunction: 'relay_settle_analytics_downtime_event',
      audience: ANALYTICS_INBOX_AUDIENCE,
      source: 'cmms',
      notConfiguredMessage:
        'Outbox relay to Analytics (downtime) is not configured; downtime facts stay in the outbox.',
    });
  }
}
