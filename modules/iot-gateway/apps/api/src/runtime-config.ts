import { createPublicKey } from 'node:crypto';

export const IOT_AUDIENCE = 'gigalibs-iot-api';
export const IOT_SCHEMA_CONTRACT_VERSION = 4;

export interface IotRuntimeConfig {
  readonly nodeEnv: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly expectedMigrationVersion: number;
  readonly platformContextPublicKey: string;
  readonly platformContextAudience: string;
}

export function loadIotRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): IotRuntimeConfig {
  return Object.freeze({
    nodeEnv: optionalString(environment, 'NODE_ENV') ?? 'development',
    apiHost: requireString(environment, 'IOT_API_HOST'),
    apiPort: parseInteger(environment, 'IOT_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'IOT_DATABASE_POOL_SIZE', 1, 100),
    expectedMigrationVersion: parseInteger(
      environment,
      'IOT_EXPECTED_MIGRATION_VERSION',
      IOT_SCHEMA_CONTRACT_VERSION,
      IOT_SCHEMA_CONTRACT_VERSION,
    ),
    platformContextPublicKey: parseEd25519PublicKey(environment),
    platformContextAudience: IOT_AUDIENCE,
  });
}

function parseEd25519PublicKey(environment: NodeJS.ProcessEnv): string {
  const base64Value = requireString(environment, 'IOT_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64');
  const key = createPublicKey({ key: Buffer.from(base64Value, 'base64'), format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('IOT_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64 must be Ed25519.');
  return key.export({ format: 'pem', type: 'spki' }).toString();
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'IOT_DATABASE_URL');
  const parsed = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('IOT_DATABASE_URL must use postgresql:// or postgres://.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'IOT_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error('IOT_CORS_ORIGINS must contain at least one origin.');
  return Object.freeze(origins);
}

function parseInteger(environment: NodeJS.ProcessEnv, key: string, min: number, max: number): number {
  const value = Number(requireString(environment, key));
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
