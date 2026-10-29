import { FINANCE_PROJECTS_INBOX_AUDIENCE } from '@gigalibs/contracts';
import { RelayInboxGuardBase, loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const FINANCE_PROJECTS_INBOX_CONFIG = Symbol('FINANCE_PROJECTS_INBOX_CONFIG');

export function loadFinanceProjectsInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'FINANCE_PROJECTS_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'FINANCE_PROJECTS_INBOX_UNUSED_URL',
    signingKey: 'FINANCE_PROJECTS_INBOX_UNUSED_KEY',
    interval: 'FINANCE_PROJECTS_INBOX_UNUSED_INTERVAL',
    peerService: 'project-operations',
  });
}

@Injectable()
export class FinanceProjectsInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(FINANCE_PROJECTS_INBOX_CONFIG) config: RelayConfig) {
    super(config, {
      audience: FINANCE_PROJECTS_INBOX_AUDIENCE,
      source: 'project-operations',
      label: 'Finance Projects WIP',
    });
  }
}
