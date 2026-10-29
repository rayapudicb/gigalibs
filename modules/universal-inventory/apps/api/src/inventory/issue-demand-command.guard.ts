import { RelayInboxGuardBase, type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';
import { Inject, Injectable } from '@nestjs/common';

export const ISSUE_DEMAND_COMMAND_CONFIG = Symbol('UNIVERSAL_INVENTORY_ISSUE_DEMAND_COMMAND_CONFIG');
export const ISSUE_DEMAND_COMMAND_AUDIENCE = 'gigalibs-universal-inventory-issue-demand-command';

export function loadIssueDemandCommandConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'INVENTORY_ISSUE_DEMAND_COMMAND_INBOX_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_ISSUE_DEMAND_COMMAND_UNUSED_RELAY_URL',
    signingKey: 'INVENTORY_ISSUE_DEMAND_COMMAND_UNUSED_SIGNING_KEY',
    interval: 'INVENTORY_ISSUE_DEMAND_COMMAND_UNUSED_INTERVAL_MS',
    peerService: 'universal-manufacturing',
  });
}

@Injectable()
export class IssueDemandCommandGuard extends RelayInboxGuardBase {
  constructor(@Inject(ISSUE_DEMAND_COMMAND_CONFIG) config: RelayConfig) {
    super(config, {
      audience: ISSUE_DEMAND_COMMAND_AUDIENCE,
      source: 'universal-manufacturing',
      label: 'Universal Inventory issue demand',
    });
  }
}
