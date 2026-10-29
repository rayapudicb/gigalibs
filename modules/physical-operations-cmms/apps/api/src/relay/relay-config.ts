import { type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';

export { relayOrigin } from '@gigalibs/module-sdk';

/** ADR-0007 option A settings for the CMMS side of the Workforce handshake (shape from the module SDK). */
export type CmmsRelayConfig = RelayConfig;

export const CMMS_RELAY_CONFIG = Symbol('CMMS_RELAY_CONFIG');
export const CMMS_ANALYTICS_RELAY_CONFIG = Symbol('CMMS_ANALYTICS_RELAY_CONFIG');
export const WORKFORCE_INBOX_AUDIENCE = 'gigalibs-workforce-inbox';
export const ANALYTICS_INBOX_AUDIENCE = 'gigalibs-analytics-inbox';
export const CMMS_INBOX_AUDIENCE = 'gigalibs-cmms-inbox';

export type CmmsAnalyticsRelayConfig = RelayConfig;

export function loadCmmsRelayConfig(environment: NodeJS.ProcessEnv = process.env): CmmsRelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'CMMS_RELAY_WORKFORCE_URL',
    signingKey: 'WORKFORCE_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'CMMS_RELAY_INTERVAL_MS',
    peerService: 'workforce-api',
  });
}

/** WI-OI-130: CMMS signs downtime facts with its Analytics inbox relay private key. */
export function loadCmmsAnalyticsRelayConfig(environment: NodeJS.ProcessEnv = process.env): CmmsAnalyticsRelayConfig {
  return loadRelayConfig(environment, {
    inboxPublicKey: 'ANALYTICS_CMMS_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'CMMS_RELAY_ANALYTICS_URL',
    signingKey: 'ANALYTICS_CMMS_INBOX_RELAY_PRIVATE_KEY_BASE64',
    interval: 'CMMS_RELAY_INTERVAL_MS',
    peerService: 'analytics-api',
  });
}
