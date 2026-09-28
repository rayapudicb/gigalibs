import { createPublicKey } from 'node:crypto';

/** Audience the web BFF signs CMMS platform contexts for (WI-OI-038). */
export const CMMS_AUDIENCE = 'gigalibs-cmms-api';
/** Catalogue key of the entitlement the signed context must carry. */
export const CMMS_MODULE_KEY = 'asset-maintenance';
/** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
export const CMMS_SCHEMA_CONTRACT_VERSION = 14;

export interface CmmsRuntimeConfig {
  readonly nodeEnv: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly expectedMigrationVersion: number;
  readonly platformContextPublicKey: string;
  readonly platformContextAudience: typeof CMMS_AUDIENCE;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): CmmsRuntimeConfig {
  const audience = requireString(environment, 'CMMS_PLATFORM_CONTEXT_AUDIENCE');
  if (audience !== CMMS_AUDIENCE) {
    throw new Error(`CMMS_PLATFORM_CONTEXT_AUDIENCE must equal ${CMMS_AUDIENCE}.`);
  }

  return Object.freeze({
    nodeEnv: optionalString(environment, 'NODE_ENV') ?? 'development',
    apiHost: requireString(environment, 'CMMS_API_HOST'),
    apiPort: parseInteger(environment, 'CMMS_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'CMMS_DATABASE_POOL_SIZE', 1, 100),
    expectedMigrationVersion: parseInteger(
      environment,
      'CMMS_EXPECTED_MIGRATION_VERSION',
      CMMS_SCHEMA_CONTRACT_VERSION,
      CMMS_SCHEMA_CONTRACT_VERSION,
    ),
    platformContextPublicKey: parseEd25519PublicKey(environment),
    platformContextAudience: CMMS_AUDIENCE,
  });
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'CMMS_DATABASE_URL');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('CMMS_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('CMMS_DATABASE_URL must include a host and database name.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'CMMS_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error('CMMS_CORS_ORIGINS must contain at least one origin.');
  return Object.freeze(origins);
}

function parseEd25519PublicKey(environment: NodeJS.ProcessEnv): string {
  const pemValue = optionalString(environment, 'CMMS_PLATFORM_CONTEXT_PUBLIC_KEY');
  const base64Value = optionalString(environment, 'CMMS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64');
  if ((pemValue ? 1 : 0) + (base64Value ? 1 : 0) !== 1) {
    throw new Error(
      'Configure exactly one of CMMS_PLATFORM_CONTEXT_PUBLIC_KEY or CMMS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64.',
    );
  }
  try {
    const key = pemValue
      ? createPublicKey(pemValue.replaceAll('\\n', '\n'))
      : createPublicKey({ key: Buffer.from(base64Value!, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error('The CMMS platform-context key must be an Ed25519 public key.');
  }
}

function parseInteger(environment: NodeJS.ProcessEnv, key: string, min: number, max: number): number {
  const raw = requireString(environment, key);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < min || value > max || String(value) !== raw) {
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
