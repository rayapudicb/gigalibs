import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const CREDIT_CHECK_COMMAND_CONFIG = Symbol('BUSINESS_PARTNERS_CREDIT_CHECK_COMMAND_CONFIG');
export const CREDIT_CHECK_COMMAND_AUDIENCE = 'gigalibs-business-partners-credit-check-command';

export function loadCreditCheckCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'BUSINESS_PARTNERS_CREDIT_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'BUSINESS_PARTNERS_CREDIT_UNUSED_RELAY_URL',
    signingKey: 'BUSINESS_PARTNERS_CREDIT_UNUSED_SIGNING_KEY',
    interval: 'BUSINESS_PARTNERS_CREDIT_UNUSED_INTERVAL_MS',
    peerService: 'universal-orders',
  });
}

@Injectable()
export class CreditCheckCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(CREDIT_CHECK_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: CREDIT_CHECK_COMMAND_AUDIENCE,
      source: 'universal-orders',
      label: 'Business Partner credit check',
    });
  }
}
