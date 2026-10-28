import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const CREDIT_INBOX_CONFIG = Symbol('BUSINESS_PARTNERS_CREDIT_INBOX_CONFIG');
export const CREDIT_INBOX_AUDIENCE = 'gigalibs-business-partners-credit-inbox';

export function loadCreditInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'BUSINESS_PARTNERS_CREDIT_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'BUSINESS_PARTNERS_CREDIT_UNUSED_RELAY_URL',
    signingKey: 'BUSINESS_PARTNERS_CREDIT_UNUSED_SIGNING_KEY',
    interval: 'BUSINESS_PARTNERS_CREDIT_UNUSED_INTERVAL_MS',
    peerService: 'ar-api',
  });
}

@Injectable()
export class CreditInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(CREDIT_INBOX_CONFIG) config: RelayConfig) {
    super(config, { audience: CREDIT_INBOX_AUDIENCE, source: 'accounts-receivable', label: 'Business Partner credit' });
  }
}
