import { type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';

export { relayOrigin } from '@gigalibs/module-sdk';

/** ADR-0007 option A settings for the Workforce side of the CMMS handshake (shape from the module SDK). */
export type WorkforceRelayConfig = RelayConfig;

export const WORKFORCE_RELAY_CONFIG = Symbol('WORKFORCE_RELAY_CONFIG');
export const WORKFORCE_ANALYTICS_RELAY_CONFIG = Symbol('WORKFORCE_ANALYTICS_RELAY_CONFIG');
export const WORKFORCE_INBOX_AUDIENCE = 'gigalibs-workforce-inbox';
export const CMMS_INBOX_AUDIENCE = 'gigalibs-cmms-inbox';
export const ANALYTICS_INBOX_AUDIENCE = 'gigalibs-analytics-inbox';

export function loadWorkforceRelayConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkforceRelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'WORKFORCE_RELAY_CMMS_URL',
    signingKey: 'CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'WORKFORCE_RELAY_INTERVAL_MS',
    peerService: 'cmms-api',
  });
}

/** WI-OI-109e3: Workforce position facts use a dedicated key for the Analytics inbox. */
export function loadWorkforceAnalyticsRelayConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WorkforceRelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'WORKFORCE_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'WORKFORCE_RELAY_ANALYTICS_URL',
    signingKey: 'ANALYTICS_WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'WORKFORCE_RELAY_INTERVAL_MS',
    peerService: 'analytics-api',
  });
}
