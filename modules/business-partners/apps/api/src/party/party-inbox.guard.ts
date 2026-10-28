import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const PARTY_INBOX_CONFIG = Symbol('BUSINESS_PARTNERS_PARTY_INBOX_CONFIG');
export const PARTY_INBOX_AUDIENCE = 'gigalibs-business-partners-inbox';

export function loadPartyInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'BUSINESS_PARTNERS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'BUSINESS_PARTNERS_UNUSED_RELAY_URL',
    signingKey: 'BUSINESS_PARTNERS_UNUSED_RELAY_KEY',
    interval: 'BUSINESS_PARTNERS_RELAY_INTERVAL_MS',
    peerService: 'module-host',
  });
}

@Injectable()
export class PartyInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(PARTY_INBOX_CONFIG) config: RelayConfig) {
    super(config, { audience: PARTY_INBOX_AUDIENCE, source: 'kernel', label: 'Business Partner' });
  }
}
