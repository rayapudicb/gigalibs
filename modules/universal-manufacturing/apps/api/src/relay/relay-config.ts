import { type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';

export type ManufacturingFinanceRelayConfig = RelayConfig;

export const MANUFACTURING_FINANCE_RELAY_CONFIG = Symbol('MANUFACTURING_FINANCE_RELAY_CONFIG');
export const FINANCE_INBOX_AUDIENCE = 'gigalibs-finance-manufacturing-inbox';

/** WI-OI-126 S7: Manufacturing → Finance subledger relay, with its own signing identity. */
export function loadManufacturingFinanceRelayConfig(environment: NodeJS.ProcessEnv = process.env): ManufacturingFinanceRelayConfig {
  const env = { ...environment };
  if (env.MANUFACTURING_RELAY_FINANCE_URL?.trim() && !env.MANUFACTURING_RELAY_FINANCE_INBOX_PATH?.trim()) {
    env.MANUFACTURING_RELAY_FINANCE_INBOX_PATH = '/financial-operations/internal/v1/manufacturing-inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'MANUFACTURING_RELAY_FINANCE_URL',
    signingKey: 'MANUFACTURING_FINANCE_RELAY_PRIVATE_KEY_BASE64',
    interval: 'MANUFACTURING_FINANCE_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'MANUFACTURING_RELAY_FINANCE_INBOX_PATH',
  });
}
