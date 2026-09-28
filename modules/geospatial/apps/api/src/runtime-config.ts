import { createPublicKey } from 'node:crypto';

const GEOSPATIAL_AUDIENCE = 'gigalibs-geospatial-api';
// The exact gigalibs_geospatial schema this image supports; must equal the last runtime-foundation migration.
export const GEOSPATIAL_SCHEMA_CONTRACT_VERSION = 3;

export interface GeospatialRuntimeConfig {
  readonly nodeEnv: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly expectedMigrationVersion: number;
  readonly platformContextPublicKey: string;
  readonly platformContextAudience: typeof GEOSPATIAL_AUDIENCE;
}

export function loadGeospatialRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GeospatialRuntimeConfig {
  const audience = requireString(environment, 'GEOSPATIAL_PLATFORM_CONTEXT_AUDIENCE');
  if (audience !== GEOSPATIAL_AUDIENCE) {
    throw new Error(`GEOSPATIAL_PLATFORM_CONTEXT_AUDIENCE must equal ${GEOSPATIAL_AUDIENCE}.`);
  }

  return Object.freeze({
    nodeEnv: optionalString(environment, 'NODE_ENV') ?? 'development',
    apiHost: requireString(environment, 'GEOSPATIAL_API_HOST'),
    apiPort: parseInteger(environment, 'GEOSPATIAL_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'GEOSPATIAL_DATABASE_POOL_SIZE', 1, 100),
    expectedMigrationVersion: parseInteger(
      environment,
      'GEOSPATIAL_EXPECTED_MIGRATION_VERSION',
      GEOSPATIAL_SCHEMA_CONTRACT_VERSION,
      GEOSPATIAL_SCHEMA_CONTRACT_VERSION,
    ),
    platformContextPublicKey: parseEd25519PublicKey(environment),
    platformContextAudience: GEOSPATIAL_AUDIENCE,
  });
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'GEOSPATIAL_DATABASE_URL');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('GEOSPATIAL_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('GEOSPATIAL_DATABASE_URL must include a host and database name.');
  }
  if (!parsed.username || !parsed.password) {
    throw new Error('GEOSPATIAL_DATABASE_URL must include a dedicated role and password.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'GEOSPATIAL_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    throw new Error('GEOSPATIAL_CORS_ORIGINS must contain explicit origins and cannot contain * .');
  }
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/') {
      throw new Error(`GEOSPATIAL_CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }
  return Object.freeze([...new Set(origins)]);
}

function parseEd25519PublicKey(environment: NodeJS.ProcessEnv): string {
  const pemValue = optionalString(environment, 'GEOSPATIAL_PLATFORM_CONTEXT_PUBLIC_KEY');
  const base64Value = optionalString(environment, 'GEOSPATIAL_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64');
  if ((pemValue ? 1 : 0) + (base64Value ? 1 : 0) !== 1) {
    throw new Error(
      'Configure exactly one of GEOSPATIAL_PLATFORM_CONTEXT_PUBLIC_KEY or GEOSPATIAL_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64.',
    );
  }

  try {
    const key = pemValue
      ? createPublicKey(pemValue.replaceAll('\\n', '\n'))
      : createPublicKey({ key: Buffer.from(base64Value!, 'base64'), format: 'der', type: 'spki' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error('The Geospatial platform-context key must be an Ed25519 public key.');
  }
}

function parseInteger(environment: NodeJS.ProcessEnv, key: string, min: number, max: number): number {
  const raw = requireString(environment, key);
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
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
