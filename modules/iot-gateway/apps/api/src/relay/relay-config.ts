import { type RelayConfig, loadRelayConfig } from '@gigalibs/module-sdk';

export const CMMS_API_AUDIENCE = 'gigalibs-cmms-api';

export interface IotCmmsRelayConfig extends RelayConfig {
  readonly cmmsBaseUrl: string | null;
}

export function loadIotCmmsRelayConfig(environment: NodeJS.ProcessEnv = process.env): IotCmmsRelayConfig {
  const base = loadRelayConfig(environment, {
    inboxPublicKey: 'IOT_INBOX_RELAY_PUBLIC_KEY_BASE64',
    targetUrl: 'IOT_RELAY_CMMS_URL',
    signingKey: 'IOT_CMMS_RELAY_PRIVATE_KEY_BASE64',
    interval: 'IOT_CMMS_RELAY_INTERVAL_MS',
    peerService: 'cmms-api',
    inboxPath: 'IOT_CMMS_RELAY_INBOX_PATH',
  });
  const rawUrl = environment.IOT_RELAY_CMMS_URL?.trim();
  return Object.freeze({
    ...base,
    cmmsBaseUrl: rawUrl ? rawUrl.replace(/\/$/, '') : null,
  });
}
