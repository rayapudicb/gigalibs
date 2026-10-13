import { createPublicKey } from 'node:crypto';

const WORKFORCE_AUDIENCE = 'gigalibs-workforce-api';
// The exact gigalibs_workforce schema this image supports; must equal the last runtime-foundation migration.
export const WORKFORCE_SCHEMA_CONTRACT_VERSION = 27;

export interface GigaOpsRuntimeConfig {
  readonly nodeEnv: string;
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly expectedMigrationVersion: number;
  readonly platformContextPublicKey: string;
  readonly platformContextAudience: typeof WORKFORCE_AUDIENCE;
  /**
   * Whether the built-in reference pay packs (not statutory advice) may be used (WI-OI-070). Off unless a local or
   * test profile sets `WORKFORCE_PAY_REFERENCE_PACKS=enabled`, so they are never production-reachable by default.
   */
  readonly payReferencePacks: boolean;
}

export function loadGigaOpsRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GigaOpsRuntimeConfig {
  const audience = requireString(environment, 'WORKFORCE_PLATFORM_CONTEXT_AUDIENCE');
  if (audience !== WORKFORCE_AUDIENCE) {
    throw new Error(
      `WORKFORCE_PLATFORM_CONTEXT_AUDIENCE must equal ${WORKFORCE_AUDIENCE}.`,
    );
  }

  return Object.freeze({
    nodeEnv: optionalString(environment, 'NODE_ENV') ?? 'development',
    apiHost: requireString(environment, 'WORKFORCE_API_HOST'),
    apiPort: parseInteger(environment, 'WORKFORCE_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'WORKFORCE_DATABASE_POOL_SIZE', 1, 100),
    expectedMigrationVersion: parseInteger(
      environment,
      'WORKFORCE_EXPECTED_MIGRATION_VERSION',
      WORKFORCE_SCHEMA_CONTRACT_VERSION,
      WORKFORCE_SCHEMA_CONTRACT_VERSION,
    ),
    platformContextPublicKey: parseEd25519PublicKey(environment),
    platformContextAudience: WORKFORCE_AUDIENCE,
    payReferencePacks: parseReferencePacks(environment),
  });
}

function parseReferencePacks(environment: NodeJS.ProcessEnv): boolean {
  const value = optionalString(environment, 'WORKFORCE_PAY_REFERENCE_PACKS') ?? 'disabled';
  if (value !== 'enabled' && value !== 'disabled') {
    throw new Error('WORKFORCE_PAY_REFERENCE_PACKS must be enabled or disabled.');
  }
  return value === 'enabled';
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'WORKFORCE_DATABASE_URL');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('WORKFORCE_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('WORKFORCE_DATABASE_URL must include a host and database name.');
  }
  if (!parsed.username || !parsed.password) {
    throw new Error('WORKFORCE_DATABASE_URL must include a dedicated role and password.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'WORKFORCE_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    throw new Error('WORKFORCE_CORS_ORIGINS must contain explicit origins and cannot contain * .');
  }
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/') {
      throw new Error(`WORKFORCE_CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }
  return Object.freeze([...new Set(origins)]);
}

function parseEd25519PublicKey(environment: NodeJS.ProcessEnv): string {
  const pemValue = optionalString(environment, 'WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY');
  const base64Value = optionalString(
    environment,
    'WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64',
  );
  if ((pemValue ? 1 : 0) + (base64Value ? 1 : 0) !== 1) {
    throw new Error(
      'Configure exactly one of WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY or WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64.',
    );
  }

  try {
    const key = pemValue
      ? createPublicKey(pemValue.replaceAll('\\n', '\n'))
      : createPublicKey({
          key: Buffer.from(base64Value!, 'base64'),
          format: 'der',
          type: 'spki',
        });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error('The Workforce platform-context key must be an Ed25519 public key.');
  }
}

function parseInteger(
  environment: NodeJS.ProcessEnv,
  key: string,
  min: number,
  max: number,
): number {
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
