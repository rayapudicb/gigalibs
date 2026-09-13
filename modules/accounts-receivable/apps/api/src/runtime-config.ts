const SUPPORTED_OIDC_ALGORITHMS = new Set(['RS256', 'ES256']);
const CLAIM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/;

export interface ArRuntimeConfig {
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

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): ArRuntimeConfig {
  const nodeEnv = optionalString(environment, 'NODE_ENV') ?? 'development';
  const allowInsecureOidc = parseBoolean(environment, 'AR_ALLOW_INSECURE_OIDC', false);
  if (nodeEnv === 'production' && allowInsecureOidc) {
    throw new Error('AR_ALLOW_INSECURE_OIDC cannot be enabled in production.');
  }

  return Object.freeze({
    nodeEnv,
    allowInsecureOidc,
    apiHost: requireString(environment, 'AR_API_HOST'),
    apiPort: parseInteger(environment, 'AR_API_PORT', 1, 65_535),
    corsOrigins: parseOrigins(environment),
    databaseUrl: parseDatabaseUrl(environment),
    databasePoolSize: parseInteger(environment, 'AR_DATABASE_POOL_SIZE', 1, 100),
    oidcIssuer: parseHttpsUrl(environment, 'AR_OIDC_ISSUER', allowInsecureOidc),
    oidcAudience: requireString(environment, 'AR_OIDC_AUDIENCE'),
    oidcJwksUri: parseHttpsUrl(environment, 'AR_OIDC_JWKS_URI', allowInsecureOidc),
    oidcAlgorithms: parseAlgorithms(environment),
    tenantClaim: parseClaimName(environment, 'AR_OIDC_TENANT_CLAIM'),
    permissionsClaim: parseClaimName(environment, 'AR_OIDC_PERMISSIONS_CLAIM'),
  });
}

function parseDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const raw = requireString(environment, 'AR_DATABASE_URL');
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('AR_DATABASE_URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('AR_DATABASE_URL must include a host and database name.');
  }
  return raw;
}

function parseOrigins(environment: NodeJS.ProcessEnv): readonly string[] {
  const origins = requireString(environment, 'AR_CORS_ORIGINS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error('AR_CORS_ORIGINS must contain at least one origin.');
  return origins.map((value) => {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) {
      throw new Error(`AR_CORS_ORIGINS contains an invalid origin: ${value}`);
    }
    return value;
  });
}

function parseHttpsUrl(
  environment: NodeJS.ProcessEnv,
  name: string,
  allowInsecure: boolean,
): string {
  const value = requireString(environment, name);
  const parsed = new URL(value);
  const allowedProtocols = allowInsecure ? ['https:', 'http:'] : ['https:'];
  if (
    !allowedProtocols.includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(`${name} must be a trusted HTTPS URL without credentials or a fragment.`);
  }
  return parsed.toString().replace(/\/$/, '');
}

function parseAlgorithms(environment: NodeJS.ProcessEnv): readonly ('RS256' | 'ES256')[] {
  const values = requireString(environment, 'AR_OIDC_ALGORITHMS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length < 1 || values.some((value) => !SUPPORTED_OIDC_ALGORITHMS.has(value))) {
    throw new Error('AR_OIDC_ALGORITHMS must contain only RS256 and/or ES256.');
  }
  return [...new Set(values)] as ('RS256' | 'ES256')[];
}

function parseClaimName(environment: NodeJS.ProcessEnv, name: string): string {
  const value = requireString(environment, name);
  if (!CLAIM_NAME_PATTERN.test(value)) throw new Error(`${name} is not a valid claim name.`);
  return value;
}

function parseInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const value = Number(requireString(environment, name));
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function parseBoolean(environment: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = optionalString(environment, name);
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function requireString(environment: NodeJS.ProcessEnv, name: string): string {
  const value = optionalString(environment, name);
  if (value === undefined) throw new Error(`${name} must be configured.`);
  return value;
}

function optionalString(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value ? value : undefined;
}
