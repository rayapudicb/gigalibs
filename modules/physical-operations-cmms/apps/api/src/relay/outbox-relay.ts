import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import {
  CMMS_RELAY_CONFIG,
  type CmmsRelayConfig,
  WORKFORCE_INBOX_AUDIENCE,
} from './relay-config.js';

export { deliver, type RelayEnvelope } from '@gigalibs/module-sdk';

/**
 * Outbox relay to the Workforce inbox (ADR-0007 option A) on the module SDK (WI-OI-082): leases staffing facts,
 * signs one relay token per message, delivers, and settles each row (published, retry with back-off, or dead
 * letter). Outbox rows stay authoritative; the Workforce inbox deduplicates.
 */
@Injectable()
export class CmmsOutboxRelay extends OutboxRelay<
  'relay_lease_workforce_events' | 'relay_settle_workforce_event' | 'outbox_sweep'
> {
  constructor(database: DatabaseService, @Inject(CMMS_RELAY_CONFIG) config: CmmsRelayConfig) {
    super(database, config, {
      leaseFunction: 'relay_lease_workforce_events',
      settleFunction: 'relay_settle_workforce_event',
      audience: WORKFORCE_INBOX_AUDIENCE,
      source: 'cmms',
      notConfiguredMessage:
        'Outbox relay to Workforce is not configured; staffing facts stay in the outbox.',
    });
  }
}
