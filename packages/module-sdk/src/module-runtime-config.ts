import { createPublicKey } from 'node:crypto';

// WI-OI-085a: strict runtime configuration for new modules, following the certified CMMS loader (WI-OI-038). Every
// variable carries the module's prefix, and every refusal names the variable. WI-OI-085e: the listener (host, port,
// CORS) is separate, because a module running inside the shared module host does not listen on its own.

export interface ModuleRuntimeConfigOptions {
  /** Environment variable prefix, for example `INSPECTIONS`. */
  readonly prefix: string;
  /** Audience the web BFF signs this module's platform contexts for. */
  readonly audience: string;
  /** Last migration in `db/runtime-manifest.txt`; readiness requires the database to be exactly here. */
  readonly schemaContractVersion: number;
}

export interface ModuleRuntimeConfig {
  readonly nodeEnv: string;
  readonly databaseUrl: string;
  readonly databasePoolSize: number;
  readonly expectedMigrationVersion: number;
  readonly platformContextPublicKey: string;
  readonly platformContextAudience: string;
}

export function loadModuleRuntimeConfig(
  options: ModuleRuntimeConfigOptions,
  environment: NodeJS.ProcessEnv = process.env,
): ModuleRuntimeConfig {
  const { prefix, audience, schemaContractVersion } = options;
  if (!/^[A-Z][A-Z0-9_]*$/.test(prefix))
    throw new Error('prefix must be upper-case letters, digits and underscores.');
  if (!Number.isSafeInteger(schemaContractVersion) || schemaContractVersion < 1)
    throw new Error('schemaContractVersion must be a positive integer.');
  const name = (suffix: string) => `${prefix}_${suffix}`;

  if (requireString(environment, name('PLATFORM_CONTEXT_AUDIENCE')) !== audience)
    throw new Error(`${name('PLATFORM_CONTEXT_AUDIENCE')} must equal ${audience}.`);

  return Object.freeze({
    nodeEnv: optionalString(environment, 'NODE_ENV') ?? 'development',
    databaseUrl: parseDatabaseUrl(environment, name('DATABASE_URL')),
    databasePoolSize: parseInteger(environment, name('DATABASE_POOL_SIZE'), 1, 100),
    expectedMigrationVersion: parseInteger(
      environment,
      name('EXPECTED_MIGRATION_VERSION'),
      schemaContractVersion,
      schemaContractVersion,
    ),
    platformContextPublicKey: parseEd25519PublicKey(environment, name('PLATFORM_CONTEXT_PUBLIC_KEY')),
    platformContextAudience: audience,
  });
}

export interface ModuleListenerConfig {
  readonly apiHost: string;
  readonly apiPort: number;
  readonly corsOrigins: readonly string[];
}

/** Where a standalone module service (or the module host) listens: `<PREFIX>_API_HOST`, `_API_PORT`, `_CORS_ORIGINS`. */
export function loadModuleListenerConfig(
  options: { readonly prefix: string },
  environment: NodeJS.ProcessEnv = process.env,
): ModuleListenerConfig {
  if (!/^[A-Z][A-Z0-9_]*$/.test(options.prefix))
    throw new Error('prefix must be upper-case letters, digits and underscores.');
  const name = (suffix: string) => `${options.prefix}_${suffix}`;
  return Object.freeze({
    apiHost: requireString(environment, name('API_HOST')),
    apiPort: parseInteger(environment, name('API_PORT'), 1, 65_535),
    corsOrigins: parseOrigins(environment, name('CORS_ORIGINS')),
  });
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv, key: string): string {
  const raw = requireString(environment, key);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${key} must be a URL.`);
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:')
    throw new Error(`${key} must use postgresql:// or postgres://.`);
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/')
    throw new Error(`${key} must include a host and database name.`);
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv, key: string): readonly string[] {
  const origins = requireString(environment, key)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error(`${key} must contain at least one origin.`);
  return Object.freeze(origins);
}

function parseEd25519PublicKey(environment: NodeJS.ProcessEnv, key: string): string {
  const pemValue = optionalString(environment, key);
  const base64Value = optionalString(environment, `${key}_BASE64`);
  if ((pemValue ? 1 : 0) + (base64Value ? 1 : 0) !== 1)
    throw new Error(`Configure exactly one of ${key} or ${key}_BASE64.`);
  try {
    const parsed = pemValue
      ? createPublicKey(pemValue.replaceAll('\\n', '\n'))
      : createPublicKey({ key: Buffer.from(base64Value!, 'base64'), format: 'der', type: 'spki' });
    if (parsed.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return parsed.export({ format: 'pem', type: 'spki' }).toString();
  } catch {
    throw new Error(`${key} must be an Ed25519 public key.`);
  }
}

function parseInteger(environment: NodeJS.ProcessEnv, key: string, min: number, max: number): number {
  const raw = requireString(environment, key);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < min || value > max || String(value) !== raw)
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
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
