import { createPublicKey } from 'node:crypto';

/** Audience the web BFF signs Analytics platform contexts for (WI-OI-064a). */
export const ANALYTICS_AUDIENCE = 'gigalibs-analytics-api';
/** Highest migration in `db/migrations`; the readiness check requires the database to be exactly here. */
export const ANALYTICS_SCHEMA_CONTRACT_VERSION = 30;

export interface AnalyticsRuntimeConfig {
  nodeEnv: string;
  apiHost: string;
  apiPort: number;
  corsOrigins: readonly string[];
  databaseUrl: string;
  databasePoolSize: number;
  expectedMigrationVersion: number;
  platformContextPublicKey: string;
  platformContextAudience: typeof ANALYTICS_AUDIENCE;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): AnalyticsRuntimeConfig {
  const audience = requireString(environment, 'ANALYTICS_PLATFORM_CONTEXT_AUDIENCE');
  if (audience !== ANALYTICS_AUDIENCE) {
    throw new Error(`ANALYTICS_PLATFORM_CONTEXT_AUDIENCE must equal ${ANALYTICS_AUDIENCE}.`);
  }

  return Object.freeze({
    nodeEnv: optionalString(environment, 'NODE_ENV') ?? 'development',
    apiHost: requireString(environment, 'ANALYTICS_API_HOST'),
    apiPort: parseInteger(environment, 'ANALYTICS_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'ANALYTICS_DATABASE_POOL_SIZE', 1, 100),
    expectedMigrationVersion: parseInteger(
      environment,
      'ANALYTICS_EXPECTED_MIGRATION_VERSION',
      ANALYTICS_SCHEMA_CONTRACT_VERSION,
      ANALYTICS_SCHEMA_CONTRACT_VERSION,
    ),
    platformContextPublicKey: parseEd25519PublicKey(environment),
    platformContextAudience: ANALYTICS_AUDIENCE,
  });
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'ANALYTICS_DATABASE_URL');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('ANALYTICS_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('ANALYTICS_DATABASE_URL must include a host and database name.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'ANALYTICS_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('ANALYTICS_CORS_ORIGINS must contain at least one origin.');
  }
  return Object.freeze(origins);
}





function parseInteger(environment: NodeJS.ProcessEnv, key: string, min: number, max: number): number {
  const raw = requireString(environment, key);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function requireString(environment: NodeJS.ProcessEnv, key: string): string {
  const value = optionalString(environment, key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function optionalString(environment: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = environment[key]?.trim();
  return value ? value : undefined;
}

function parseEd25519PublicKey(environment: NodeJS.ProcessEnv): string {
  const pemValue = optionalString(environment, 'ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY');
  const base64Value = optionalString(environment, 'ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64');
  if ((pemValue ? 1 : 0) + (base64Value ? 1 : 0) !== 1) {
    throw new Error(
      'Configure exactly one of ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY or ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64.',
    );
  }

  try {
    const key = pemValue
      ? createPublicKey(pemValue.replaceAll('\\n', '\n'))
      : createPublicKey({ key: Buffer.from(base64Value!, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error('The Analytics platform-context key must be an Ed25519 public key.');
  }
}
