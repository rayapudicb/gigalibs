import { RelayInboxGuardBase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import {
  INVENTORY_FINANCE_INBOX_CONFIG,
  INVENTORY_INBOX_AUDIENCE,
  type InventoryFinanceInboxConfig,
} from './relay-config.js';

export type { RelayRequest } from '@gigalibs/module-sdk';

@Injectable()
export class InventoryRelayInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(INVENTORY_FINANCE_INBOX_CONFIG) config: InventoryFinanceInboxConfig) {
    super(config, { audience: INVENTORY_INBOX_AUDIENCE, source: 'finance', label: 'Inventory' });
  }
}
