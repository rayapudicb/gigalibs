import { RelayInboxGuardBase } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import {
  WORKFORCE_INBOX_AUDIENCE,
  WORKFORCE_RELAY_CONFIG,
  type WorkforceRelayConfig,
} from './relay-config.js';

export type { RelayRequest } from '@gigalibs/module-sdk';

/**
 * Inbox authority (ADR-0007 option A) on the module SDK (WI-OI-082): only a relay token signed with the Workforce
 * inbox key by CMMS, bound to the exact request body, whose tenant and message id match the envelope.
 */
@Injectable()
export class RelayInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(WORKFORCE_RELAY_CONFIG) config: WorkforceRelayConfig) {
    super(config, { audience: WORKFORCE_INBOX_AUDIENCE, source: 'cmms', label: 'Workforce' });
  }
}
