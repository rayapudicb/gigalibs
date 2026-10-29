import { RelayInboxGuardBase, loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const FINANCE_MANUFACTURING_INBOX_CONFIG = Symbol('FINANCE_MANUFACTURING_INBOX_CONFIG');
export const FINANCE_MANUFACTURING_INBOX_AUDIENCE = 'gigalibs-finance-manufacturing-inbox';

export function loadFinanceManufacturingInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'FINANCE_MANUFACTURING_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'FINANCE_MANUFACTURING_UNUSED_URL',
    signingKey: 'FINANCE_MANUFACTURING_UNUSED_KEY',
    interval: 'FINANCE_MANUFACTURING_UNUSED_INTERVAL',
    peerService: 'universal-manufacturing',
  });
}

@Injectable()
export class FinanceManufacturingInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(FINANCE_MANUFACTURING_INBOX_CONFIG) config: RelayConfig) {
    super(config, {
      audience: FINANCE_MANUFACTURING_INBOX_AUDIENCE,
      source: 'universal-manufacturing',
      label: 'Finance manufacturing',
    });
  }
}
