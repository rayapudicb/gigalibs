import * as client from 'openid-client';
import { webConfig } from './config';

let configuration: Promise<client.Configuration> | undefined;

export function oidcConfiguration(): Promise<client.Configuration> {
  if (!configuration) {
    const config = webConfig();
    configuration = client.discovery(
      new URL(config.oidcIssuer),
      config.oidcClientId,
      config.oidcClientSecret,
      undefined,
      {
        timeout: 5,
        ...(config.allowInsecureHttp ? { execute: [client.allowInsecureRequests] } : {}),
      },
    );
  }
  return configuration;
}
