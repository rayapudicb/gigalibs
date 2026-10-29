import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';
import { AR_PROJECTS_INBOX_AUDIENCE } from '@gigalibs/contracts';

export const PROJECTS_BILLING_INBOX_CONFIG = Symbol('AR_PROJECTS_BILLING_INBOX_CONFIG');

export function loadProjectsBillingInboxConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'AR_PROJECTS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'AR_PROJECTS_UNUSED_RELAY_URL',
    signingKey: 'AR_PROJECTS_UNUSED_RELAY_KEY',
    interval: 'AR_PROJECTS_RELAY_INTERVAL_MS',
    peerService: 'module-host',
  });
}

@Injectable()
export class ProjectsBillingInboxGuard extends RelayInboxGuardBase {
  constructor(@Inject(PROJECTS_BILLING_INBOX_CONFIG) config: RelayConfig) {
    super(config, {
      audience: AR_PROJECTS_INBOX_AUDIENCE,
      source: 'project-operations',
      label: 'AR project billing',
    });
  }
}
