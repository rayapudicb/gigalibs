import { createPublicKey } from 'node:crypto';

const ORIGIN_PROTOCOLS = new Set(['http:', 'https:']);
/** The audience the web BFF signs Connector Hub contexts for (WI-OI-104a). */
export const CONNECTOR_HUB_AUDIENCE = 'gigalibs-connector-hub-api';

export interface ConnectorHubRuntimeConfig {
  readonly nodeEnv: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly vaultKey: string;
  readonly expectedMigrationVersion: number;
  readonly allowedOutboundHosts: ReadonlySet<string>;
  readonly allowInsecureOutbound: boolean;
  /** Ed25519 public key (PEM) of the web BFF's Connector Hub signing key. */
  readonly platformContextPublicKey: string;
  readonly platformContextAudience: string;
}

export function loadConnectorHubRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ConnectorHubRuntimeConfig {
  return Object.freeze({
    nodeEnv: optionalString(environment, 'NODE_ENV') ?? 'development',
    apiHost: requireString(environment, 'CONNECTOR_HUB_API_HOST'),
    apiPort: parseInteger(environment, 'CONNECTOR_HUB_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'CONNECTOR_HUB_DATABASE_POOL_SIZE', 1, 100),
    vaultKey: parseVaultKey(environment),
    expectedMigrationVersion: parseInteger(
      environment,
      'CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION',
      7,
      7,
    ),
    allowedOutboundHosts: parseHostAllowlist(environment),
    allowInsecureOutbound: parseBoolean(
      environment,
      'CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND',
    ),
    platformContextPublicKey: parseEd25519PublicKey(environment),
    platformContextAudience: CONNECTOR_HUB_AUDIENCE,
  });
}

function parseEd25519PublicKey(environment: NodeJS.ProcessEnv): string {
  const base64Value = requireString(environment, 'CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64');
  try {
    const key = createPublicKey({ key: Buffer.from(base64Value, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error('CONNECTOR_HUB_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64 must be an Ed25519 public key (base64 DER).');
  }
}

export function assertAllowedConnectorUrl(
  rawUrl: string,
  config: Pick<ConnectorHubRuntimeConfig, 'allowedOutboundHosts' | 'allowInsecureOutbound'>,
): URL {
  const parsed = new URL(rawUrl);
  const protocolAllowed =
    parsed.protocol === 'https:' ||
    (config.allowInsecureOutbound && parsed.protocol === 'http:');
  if (
    !protocolAllowed ||
    !config.allowedOutboundHosts.has(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('Connector endpoint is outside the configured outbound allowlist.');
  }
  return parsed;
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'CONNECTORS_DATABASE_URL');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('CONNECTORS_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/' || !parsed.username) {
    throw new Error('CONNECTORS_DATABASE_URL must include a host, database name and runtime user.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'CONNECTOR_HUB_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('CONNECTOR_HUB_CORS_ORIGINS must contain at least one origin.');
  }
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!ORIGIN_PROTOCOLS.has(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error('CONNECTOR_HUB_CORS_ORIGINS must contain credential-free HTTP(S) origins.');
    }
  }
  return Object.freeze(origins);
}

function parseVaultKey(environment: NodeJS.ProcessEnv): string {
  const value = requireString(environment, 'CONNECTOR_VAULT_KEY');
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('CONNECTOR_VAULT_KEY must contain at least 32 bytes.');
  }
  return value;
}

function parseHostAllowlist(environment: NodeJS.ProcessEnv): ReadonlySet<string> {
  const hosts = requireString(environment, 'CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  for (const host of hosts) {
    if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) {
      throw new Error('CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS contains an invalid hostname.');
    }
  }
  return new Set(hosts);
}

function parseBoolean(environment: NodeJS.ProcessEnv, key: string): boolean {
  const value = requireString(environment, key).toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} must be true or false.`);
}

function parseInteger(
  environment: NodeJS.ProcessEnv,
  key: string,
  min: number,
  max: number,
): number {
  const raw = requireString(environment, key);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function requireString(environment: NodeJS.ProcessEnv, key: string): string {
  const value = optionalString(environment, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(environment: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = environment[key]?.trim();
  return value ? value : undefined;
}
