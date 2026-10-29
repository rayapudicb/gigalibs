import { loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';
import { FINANCE_RETURNS_INBOX_AUDIENCE, ORDERS_RETURNS_RMA_INBOX_AUDIENCE } from '@gigalibs/contracts';

export const RETURNS_ORDERS_RELAY_CONFIG = Symbol('RETURNS_ORDERS_RELAY_CONFIG');
export const RETURNS_FINANCE_RELAY_CONFIG = Symbol('RETURNS_FINANCE_RELAY_CONFIG');

export function loadReturnsOrdersRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  const env = { ...environment };
  if (env.UNIVERSAL_RETURNS_ORDERS_RELAY_URL?.trim() && !env.UNIVERSAL_RETURNS_ORDERS_RELAY_INBOX_PATH?.trim()) {
    env.UNIVERSAL_RETURNS_ORDERS_RELAY_INBOX_PATH = '/universal-orders/internal/v1/returns-rma-inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'UNIVERSAL_RETURNS_ORDERS_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'UNIVERSAL_RETURNS_ORDERS_RELAY_URL',
    signingKey: 'UNIVERSAL_RETURNS_ORDERS_RELAY_PRIVATE_KEY_BASE64',
    interval: 'UNIVERSAL_RETURNS_ORDERS_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'UNIVERSAL_RETURNS_ORDERS_RELAY_INBOX_PATH',
  });
}

export function loadReturnsFinanceRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  const env = { ...environment };
  if (env.UNIVERSAL_RETURNS_FINANCE_RELAY_URL?.trim() && !env.UNIVERSAL_RETURNS_FINANCE_RELAY_INBOX_PATH?.trim()) {
    env.UNIVERSAL_RETURNS_FINANCE_RELAY_INBOX_PATH = '/financial-operations/internal/v1/returns-inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'UNIVERSAL_RETURNS_FINANCE_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'UNIVERSAL_RETURNS_FINANCE_RELAY_URL',
    signingKey: 'UNIVERSAL_RETURNS_FINANCE_RELAY_PRIVATE_KEY_BASE64',
    interval: 'UNIVERSAL_RETURNS_FINANCE_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'UNIVERSAL_RETURNS_FINANCE_RELAY_INBOX_PATH',
  });
}

export { ORDERS_RETURNS_RMA_INBOX_AUDIENCE, FINANCE_RETURNS_INBOX_AUDIENCE };
