import { RelayInboxGuardBase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { FINANCE_INBOX_AUDIENCE, FINANCE_RELAY_CONFIG, type FinanceRelayConfig } from './relay-config.js';

export type { RelayRequest } from '@gigalibs/module-sdk';

@Injectable()
export class FinanceRelayInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(FINANCE_RELAY_CONFIG) config: FinanceRelayConfig) {
    super(config, { audience: FINANCE_INBOX_AUDIENCE, source: 'inventory', label: 'Finance' });
  }
}
