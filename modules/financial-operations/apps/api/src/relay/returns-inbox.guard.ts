import { FINANCE_RETURNS_INBOX_AUDIENCE } from '@gigalibs/contracts';
import { RelayInboxGuardBase, loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const FINANCE_RETURNS_INBOX_CONFIG = Symbol('FINANCE_RETURNS_INBOX_CONFIG');

export function loadFinanceReturnsInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'FINANCE_RETURNS_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'FINANCE_RETURNS_INBOX_UNUSED_URL',
    signingKey: 'FINANCE_RETURNS_INBOX_UNUSED_KEY',
    interval: 'FINANCE_RETURNS_INBOX_UNUSED_INTERVAL',
    peerService: 'universal-returns',
  });
}

@Injectable()
export class FinanceReturnsInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(FINANCE_RETURNS_INBOX_CONFIG) config: RelayConfig) {
    super(config, {
      audience: FINANCE_RETURNS_INBOX_AUDIENCE,
      source: 'universal-returns',
      label: 'Finance Returns RMA',
    });
  }
}
