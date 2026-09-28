import { RelayInboxGuardBase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { CMMS_INBOX_AUDIENCE, CMMS_RELAY_CONFIG, type CmmsRelayConfig } from './relay-config.js';

export type { RelayRequest } from '@gigalibs/module-sdk';

/**
 * Inbox authority (ADR-0007 option A) on the module SDK (WI-OI-082): only a relay token signed with the CMMS inbox
 * key by Workforce, bound to the exact request body, whose tenant and message id match the envelope.
 */
@Injectable()
export class RelayInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(CMMS_RELAY_CONFIG) config: CmmsRelayConfig) {
    super(config, { audience: CMMS_INBOX_AUDIENCE, source: 'workforce', label: 'CMMS' });
  }
}
