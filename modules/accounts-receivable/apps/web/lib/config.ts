import { z } from 'zod';

const configSchema = z
  .object({
    AR_WEB_BASE_URL: z.url(),
    AR_API_BASE_URL: z.url(),
    AR_WEB_OIDC_ISSUER: z.url(),
    AR_WEB_OIDC_CLIENT_ID: z.string().min(1).max(200),
    AR_WEB_OIDC_CLIENT_SECRET: z.string().min(16).max(1000),
    AR_WEB_OIDC_SCOPE: z.string().min(6).max(500),
    AR_WEB_SESSION_SECRET: z
      .base64()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'must decode to exactly 32 bytes',
      }),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    AR_WEB_ALLOW_INSECURE_HTTP: z.enum(['true', 'false']).default('false'),
  })
  .strict();

export interface WebRuntimeConfig {
  webBaseUrl: string;
  apiBaseUrl: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcScope: string;
  sessionSecret: Uint8Array;
  secureCookies: boolean;
  allowInsecureHttp: boolean;
}

let cached: WebRuntimeConfig | undefined;

export function webConfig(): WebRuntimeConfig {
  if (cached) return cached;
  const parsed = configSchema.parse({
    AR_WEB_BASE_URL: process.env.AR_WEB_BASE_URL,
    AR_API_BASE_URL: process.env.AR_API_BASE_URL,
    AR_WEB_OIDC_ISSUER: process.env.AR_WEB_OIDC_ISSUER,
    AR_WEB_OIDC_CLIENT_ID: process.env.AR_WEB_OIDC_CLIENT_ID,
    AR_WEB_OIDC_CLIENT_SECRET: process.env.AR_WEB_OIDC_CLIENT_SECRET,
    AR_WEB_OIDC_SCOPE: process.env.AR_WEB_OIDC_SCOPE,
    AR_WEB_SESSION_SECRET: process.env.AR_WEB_SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    AR_WEB_ALLOW_INSECURE_HTTP: process.env.AR_WEB_ALLOW_INSECURE_HTTP,
  });
  const allowHttp = parsed.AR_WEB_ALLOW_INSECURE_HTTP === 'true';
  const webUrl = new URL(parsed.AR_WEB_BASE_URL);
  if (
    parsed.NODE_ENV === 'production' &&
    allowHttp &&
    !['localhost', '127.0.0.1', '::1'].includes(webUrl.hostname)
  ) {
    throw new Error('Insecure HTTP is allowed only for an explicit loopback deployment.');
  }
  for (const [name, value] of [
    ['AR_WEB_BASE_URL', parsed.AR_WEB_BASE_URL],
    ['AR_API_BASE_URL', parsed.AR_API_BASE_URL],
    ['AR_WEB_OIDC_ISSUER', parsed.AR_WEB_OIDC_ISSUER],
  ] as const) {
    const url = new URL(value);
    if (url.protocol !== 'https:' && !allowHttp) throw new Error(`${name} must use HTTPS.`);
    if (url.username || url.password || url.hash)
      throw new Error(`${name} must not contain credentials.`);
  }
  if (!parsed.AR_WEB_OIDC_SCOPE.split(/\s+/).includes('openid')) {
    throw new Error('AR_WEB_OIDC_SCOPE must include openid.');
  }
  cached = Object.freeze({
    webBaseUrl: parsed.AR_WEB_BASE_URL.replace(/\/$/, ''),
    apiBaseUrl: parsed.AR_API_BASE_URL.replace(/\/$/, ''),
    oidcIssuer: parsed.AR_WEB_OIDC_ISSUER.replace(/\/$/, ''),
    oidcClientId: parsed.AR_WEB_OIDC_CLIENT_ID,
    oidcClientSecret: parsed.AR_WEB_OIDC_CLIENT_SECRET,
    oidcScope: parsed.AR_WEB_OIDC_SCOPE,
    sessionSecret: new Uint8Array(Buffer.from(parsed.AR_WEB_SESSION_SECRET, 'base64')),
    secureCookies: webUrl.protocol === 'https:',
    allowInsecureHttp: allowHttp,
  });
  return cached;
}

export function resetWebConfigForTests(): void {
  cached = undefined;
}
