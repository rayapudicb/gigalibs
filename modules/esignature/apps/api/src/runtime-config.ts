const SUPPORTED_OIDC_ALGORITHMS = new Set(['RS256', 'ES256']);
const CLAIM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/;

export interface EsignRuntimeConfig {
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

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): EsignRuntimeConfig {
  const nodeEnv = optionalString(environment, 'NODE_ENV') ?? 'development';
  const allowInsecureOidc = parseBoolean(environment, 'ESIGN_ALLOW_INSECURE_OIDC', false);
  if (nodeEnv === 'production' && allowInsecureOidc) {
    throw new Error('ESIGN_ALLOW_INSECURE_OIDC cannot be enabled in production.');
  }

  return Object.freeze({
    nodeEnv,
    allowInsecureOidc,
    apiHost: requireString(environment, 'ESIGN_API_HOST'),
    apiPort: parseInteger(environment, 'ESIGN_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'ESIGN_DATABASE_POOL_SIZE', 1, 100),
    oidcIssuer: parseHttpsUrl(environment, 'ESIGN_OIDC_ISSUER', allowInsecureOidc),
    oidcAudience: requireString(environment, 'ESIGN_OIDC_AUDIENCE'),
    oidcJwksUri: parseHttpsUrl(environment, 'ESIGN_OIDC_JWKS_URI', allowInsecureOidc),
    oidcAlgorithms: parseAlgorithms(environment),
    tenantClaim: parseClaimName(environment, 'ESIGN_OIDC_TENANT_CLAIM'),
    permissionsClaim: parseClaimName(environment, 'ESIGN_OIDC_PERMISSIONS_CLAIM'),
  });
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'ESIGN_DATABASE_URL');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('ESIGN_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('ESIGN_DATABASE_URL must include a host and database name.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'ESIGN_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('ESIGN_CORS_ORIGINS must contain at least one origin.');
  }
  return Object.freeze(origins);
}

function parseAlgorithms(environment: NodeJS.ProcessEnv): readonly ('RS256' | 'ES256')[] {
  const algorithms = requireString(environment, 'ESIGN_OIDC_ALGORITHMS')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (algorithms.length === 0) {
    throw new Error('ESIGN_OIDC_ALGORITHMS must include at least one algorithm.');
  }
  for (const alg of algorithms) {
    if (!SUPPORTED_OIDC_ALGORITHMS.has(alg)) {
      throw new Error(`Unsupported OIDC algorithm: ${alg}`);
    }
  }
  return Object.freeze(algorithms as ('RS256' | 'ES256')[]);
}

function parseHttpsUrl(environment: NodeJS.ProcessEnv, key: string, allowInsecure: boolean): string {
  const raw = requireString(environment, key);
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' && !(allowInsecure && parsed.protocol === 'http:')) {
    throw new Error(`${key} must be an HTTPS URL unless insecure mode is explicitly allowed.`);
  }
  return raw;
}

function parseClaimName(environment: NodeJS.ProcessEnv, key: string): string {
  const value = requireString(environment, key);
  if (!CLAIM_NAME_PATTERN.test(value)) {
    throw new Error(`${key} contains invalid claim characters.`);
  }
  return value;
}

function parseBoolean(environment: NodeJS.ProcessEnv, key: string, defaultValue: boolean): boolean {
  const value = optionalString(environment, key);
  if (value === undefined) return defaultValue;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  throw new Error(`${key} must be a boolean.`);
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
