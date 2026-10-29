import { AR_PROJECTS_INBOX_AUDIENCE, FINANCE_PROJECTS_INBOX_AUDIENCE } from '@gigalibs/contracts';
import { loadRelayConfig, type RelayConfig } from '@gigalibs/module-sdk';

export const PROJECT_FINANCE_RELAY_CONFIG = Symbol('PROJECT_FINANCE_RELAY_CONFIG');
export const PROJECT_AR_RELAY_CONFIG = Symbol('PROJECT_AR_RELAY_CONFIG');

export function loadProjectFinanceRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  const env = { ...environment };
  if (env.PROJECT_OPERATIONS_FINANCE_RELAY_URL?.trim() && !env.PROJECT_OPERATIONS_FINANCE_RELAY_INBOX_PATH?.trim()) {
    env.PROJECT_OPERATIONS_FINANCE_RELAY_INBOX_PATH = '/financial-operations/internal/v1/projects-inbox';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'PROJECT_OPERATIONS_FINANCE_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'PROJECT_OPERATIONS_FINANCE_RELAY_URL',
    signingKey: 'PROJECT_OPERATIONS_FINANCE_RELAY_PRIVATE_KEY_BASE64',
    interval: 'PROJECT_OPERATIONS_FINANCE_RELAY_INTERVAL_MS',
    peerService: 'module-host',
    inboxPath: 'PROJECT_OPERATIONS_FINANCE_RELAY_INBOX_PATH',
  });
}

export function loadProjectArRelayConfig(environment: NodeJS.ProcessEnv = process.env): RelayConfig {
  const env = { ...environment };
  if (env.PROJECT_OPERATIONS_AR_RELAY_URL?.trim() && !env.PROJECT_OPERATIONS_AR_RELAY_INBOX_PATH?.trim()) {
    env.PROJECT_OPERATIONS_AR_RELAY_INBOX_PATH = '/internal/v1/projects-billing';
  }
  return loadRelayConfig(env, {
    inboxPublicKey: 'PROJECT_OPERATIONS_AR_RELAY_UNUSED_PUBLIC_KEY',
    targetUrl: 'PROJECT_OPERATIONS_AR_RELAY_URL',
    signingKey: 'PROJECT_OPERATIONS_AR_RELAY_PRIVATE_KEY_BASE64',
    interval: 'PROJECT_OPERATIONS_AR_RELAY_INTERVAL_MS',
    peerService: 'ar-api',
    inboxPath: 'PROJECT_OPERATIONS_AR_RELAY_INBOX_PATH',
  });
}

export { AR_PROJECTS_INBOX_AUDIENCE, FINANCE_PROJECTS_INBOX_AUDIENCE };
