import { type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';

export type FinanceRelayConfig = RelayConfig;

export const FINANCE_RELAY_CONFIG = Symbol('FINANCE_RELAY_CONFIG');
export const FINANCE_INBOX_AUDIENCE = 'gigalibs-finance-inbox';

export function loadFinanceRelayConfig(environment: NodeJS.ProcessEnv = process.env): FinanceRelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'FINANCE_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'FINANCE_RELAY_PLACEHOLDER_URL',
    signingKey: 'FINANCE_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'FINANCE_RELAY_INTERVAL_MS',
    peerService: 'financial-operations-api',
  });
}
