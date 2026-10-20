import { type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';

export type FinanceRelayConfig = RelayConfig;

export const FINANCE_RELAY_CONFIG = Symbol('FINANCE_RELAY_CONFIG');
export const FINANCE_INVENTORY_OUTBOUND_CONFIG = Symbol('FINANCE_INVENTORY_OUTBOUND_CONFIG');
export const FINANCE_INBOX_AUDIENCE = 'gigalibs-finance-inbox';
export const INVENTORY_INBOX_AUDIENCE = 'gigalibs-inventory-inbox';

export function loadFinanceRelayConfig(environment: NodeJS.ProcessEnv = process.env): FinanceRelayConfig {
  const env = { ...environment };
  // Module-host shares relay env with Inventory; Finance verifies Inventory→Finance tokens only.
  delete env.FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64;
  delete env.FINANCE_RELAY_PLACEHOLDER_URL;
  return loadRelayConfig(env, {
    inboxPublicKey: 'FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'FINANCE_RELAY_PLACEHOLDER_URL',
    signingKey: 'FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'FINANCE_RELAY_INTERVAL_MS',
    peerService: 'financial-operations-api',
  });
}

export type FinanceInventoryOutboundConfig = RelayConfig;

/** WI-OI-120bp: Finance → Inventory relay (posting outcomes + fiscal period replica). */
export function loadFinanceInventoryOutboundConfig(
  environment: NodeJS.ProcessEnv = process.env,
): FinanceInventoryOutboundConfig {
  const env = { ...environment };
  delete env.INVENTORY_INBOX_RELAY_PUBLIC_KEY_BASE64;
  if (env.FINANCE_RELAY_INVENTORY_URL?.trim() && !env.FINANCE_RELAY_INVENTORY_INBOX_PATH?.trim()) {
    env.FINANCE_RELAY_INVENTORY_INBOX_PATH = '/universal-inventory/internal/v1/inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'INVENTORY_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'FINANCE_RELAY_INVENTORY_URL',
    signingKey: 'FINANCE_INVENTORY_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'FINANCE_INVENTORY_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'FINANCE_RELAY_INVENTORY_INBOX_PATH',
  });
}
