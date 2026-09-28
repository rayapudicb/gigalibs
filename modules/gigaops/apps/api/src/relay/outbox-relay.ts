import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { WorkforceDatabaseService } from '../database/database.service.js';
import {
  CMMS_INBOX_AUDIENCE,
  WORKFORCE_RELAY_CONFIG,
  type WorkforceRelayConfig,
} from './relay-config.js';

export { deliver, type RelayEnvelope } from '@gigalibs/module-sdk';

/**
 * Outbox relay to the CMMS inbox (ADR-0007 option A) on the module SDK (WI-OI-082): leases handshake facts, signs
 * one relay token per message, delivers, and settles each row (published, retry with back-off, or dead letter).
 * Outbox rows stay authoritative; the CMMS inbox deduplicates.
 */
@Injectable()
export class WorkforceOutboxRelay extends OutboxRelay<
  'relay_lease_cmms_events' | 'relay_settle_cmms_event' | 'outbox_sweep'
> {
  constructor(
    database: WorkforceDatabaseService,
    @Inject(WORKFORCE_RELAY_CONFIG) config: WorkforceRelayConfig,
  ) {
    super(database, config, {
      leaseFunction: 'relay_lease_cmms_events',
      settleFunction: 'relay_settle_cmms_event',
      audience: CMMS_INBOX_AUDIENCE,
      source: 'workforce',
      notConfiguredMessage:
        'Outbox relay to CMMS is not configured; handshake facts stay in the outbox.',
    });
  }
}
