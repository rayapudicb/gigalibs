import { OutboxRelay } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import {
  INVENTORY_PROCUREMENT_RELAY_CONFIG,
  PROCUREMENT_INBOX_AUDIENCE,
  type InventoryProcurementRelayConfig,
} from './relay-config.js';

/** WI-OI-125 S5: relays replenishment PO draft facts to Procurement (ADR-0007 option A). */
@Injectable()
export class InventoryProcurementOutboxRelay extends OutboxRelay<
  'relay_lease_procurement_draft_events' | 'relay_settle_procurement_draft_event'
> {
  constructor(
    database: DatabaseService,
    @Inject(INVENTORY_PROCUREMENT_RELAY_CONFIG) config: InventoryProcurementRelayConfig,
  ) {
    super(database, config, {
      leaseFunction: 'relay_lease_procurement_draft_events',
      settleFunction: 'relay_settle_procurement_draft_event',
      audience: PROCUREMENT_INBOX_AUDIENCE,
      source: 'inventory',
      notConfiguredMessage:
        'Outbox relay to Procurement is not configured; replenishment PO drafts stay in the outbox.',
    });
  }
}
