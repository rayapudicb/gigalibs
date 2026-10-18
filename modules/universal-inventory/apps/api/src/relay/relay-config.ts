import { type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';

export type InventoryRelayConfig = RelayConfig;

export const INVENTORY_RELAY_CONFIG = Symbol('INVENTORY_RELAY_CONFIG');
export const FINANCE_INBOX_AUDIENCE = 'gigalibs-finance-inbox';

/** WI-OI-120fq (F2): Inventory → Finance subledger relay (ADR-0007 option A). */
export function loadInventoryFinanceRelayConfig(environment: NodeJS.ProcessEnv = process.env): InventoryRelayConfig {
  const env = { ...environment };
  if (env.INVENTORY_RELAY_FINANCE_URL?.trim() && !env.INVENTORY_RELAY_FINANCE_INBOX_PATH?.trim()) {
    env.INVENTORY_RELAY_FINANCE_INBOX_PATH = '/financial-operations/internal/v1/inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'INVENTORY_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'INVENTORY_RELAY_FINANCE_URL',
    signingKey: 'FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'INVENTORY_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'INVENTORY_RELAY_FINANCE_INBOX_PATH',
  });
}
