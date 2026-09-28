const SUPPORTED_OIDC_ALGORITHMS = new Set(['RS256', 'ES256']);
const CLAIM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/;

export interface SpendRuntimeConfig {
  nodeEnv: string;
  allowInsecureOidc: boolean;
  apiHost: string;
  apiPort: number;
  corsOrigins: readonly string[];
  databaseUrl: string;
  databasePoolSize: number;
  oidcIssuer: string;
  oidcAudience: string;
  oidcJwksUri: string;
  oidcAlgorithms: readonly ('RS256' | 'ES256')[];
  tenantClaim: string;
  permissionsClaim: string;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): SpendRuntimeConfig {
  const nodeEnv = optionalString(environment, 'NODE_ENV') ?? 'development';
  const allowInsecureOidc = parseBoolean(environment, 'SPEND_ALLOW_INSECURE_OIDC', false);
  if (nodeEnv === 'production' && allowInsecureOidc) {
    throw new Error('SPEND_ALLOW_INSECURE_OIDC cannot be enabled in production.');
  }

  return Object.freeze({
    nodeEnv,
    allowInsecureOidc,
    apiHost: requireString(environment, 'SPEND_API_HOST'),
    apiPort: parseInteger(environment, 'SPEND_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'SPEND_DATABASE_POOL_SIZE', 1, 100),
    oidcIssuer: parseHttpsUrl(environment, 'SPEND_OIDC_ISSUER', allowInsecureOidc),
    oidcAudience: requireString(environment, 'SPEND_OIDC_AUDIENCE'),
    oidcJwksUri: parseHttpsUrl(environment, 'SPEND_OIDC_JWKS_URI', allowInsecureOidc),
    oidcAlgorithms: parseAlgorithms(environment),
    tenantClaim: parseClaimName(environment, 'SPEND_OIDC_TENANT_CLAIM'),
    permissionsClaim: parseClaimName(environment, 'SPEND_OIDC_PERMISSIONS_CLAIM'),
  });
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'SPEND_DATABASE_URL');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('SPEND_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('SPEND_DATABASE_URL must include a host and database name.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'SPEND_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('SPEND_CORS_ORIGINS must contain at least one origin.');
  }
  return Object.freeze(origins);
}

function parseHttpsUrl(
  environment: NodeJS.ProcessEnv,
  key: string,
  allowInsecureOidc: boolean,
): string {
  const raw = requireString(environment, key);
  const parsed = new URL(raw);
  if (parsed.protocol === 'http:' && allowInsecureOidc) {
    return raw;
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${key} must be an https:// URL.`);
  }
  return raw;
}

function parseAlgorithms(environment: NodeJS.ProcessEnv): readonly ('RS256' | 'ES256')[] {
  const items = requireString(environment, 'SPEND_OIDC_ALGORITHMS')
    .split(',')
    .map((value) => value.trim());
  const algorithms: ('RS256' | 'ES256')[] = [];
  for (const item of items) {
    if (!SUPPORTED_OIDC_ALGORITHMS.has(item)) {
      throw new Error(`Unsupported algorithm in SPEND_OIDC_ALGORITHMS: ${item}`);
    }
    algorithms.push(item as 'RS256' | 'ES256');
  }
  return Object.freeze(algorithms);
}

function parseClaimName(environment: NodeJS.ProcessEnv, key: string): string {
  const value = requireString(environment, key);
  if (!CLAIM_NAME_PATTERN.test(value)) {
    throw new Error(`${key} must be a valid claim name.`);
  }
  return value;
}

function requireString(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new Error(`Required environment variable ${key} is missing.`);
  }
  return value;
}

function optionalString(environment: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = environment[key]?.trim();
  return value ? value : undefined;
}

function parseInteger(
  environment: NodeJS.ProcessEnv,
  key: string,
  min: number,
  max: number,
): number {
  const raw = requireString(environment, key);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

function parseBoolean(environment: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = environment[key]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${key} must be true or false.`);
}
