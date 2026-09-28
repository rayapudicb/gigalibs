const SUPPORTED_OIDC_ALGORITHMS = new Set(['RS256', 'ES256']);
const CLAIM_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.:/-]{0,127}$/;

export interface OntologyRuntimeConfig {
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

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): OntologyRuntimeConfig {
  const nodeEnv = optionalString(environment, 'NODE_ENV') ?? 'development';
  const allowInsecureOidc = parseBoolean(environment, 'ONTOLOGY_ALLOW_INSECURE_OIDC', nodeEnv !== 'production');
  if (nodeEnv === 'production' && allowInsecureOidc) {
    throw new Error('ONTOLOGY_ALLOW_INSECURE_OIDC cannot be enabled in production.');
  }

  const databaseUrl = optionalString(environment, 'ONTOLOGY_DATABASE_URL') ??
    optionalString(environment, 'DATABASE_URL') ??
    'postgresql://postgres:postgres@127.0.0.1:5432/gigalibs_test';

  const defaultIssuer = 'https://auth.example.invalid';
  const defaultJwks = 'https://auth.example.invalid/.well-known/jwks.json';

  return Object.freeze({
    nodeEnv,
    allowInsecureOidc,
    apiHost: optionalString(environment, 'ONTOLOGY_API_HOST') ?? '0.0.0.0',
    apiPort: parseIntegerWithDefault(environment, 'ONTOLOGY_API_PORT', 3019, 1, 65_535),
    corsOrigins: parseOriginsWithDefault(environment, 'ONTOLOGY_CORS_ORIGINS', ['http://localhost:3000', 'http://127.0.0.1:5180']),
    databaseUrl: parseDatabaseUrl(databaseUrl),
    databasePoolSize: parseIntegerWithDefault(environment, 'ONTOLOGY_DATABASE_POOL_SIZE', 10, 1, 100),
    oidcIssuer: parseHttpsUrlWithDefault(environment, 'ONTOLOGY_OIDC_ISSUER', defaultIssuer, allowInsecureOidc),
    oidcAudience: optionalString(environment, 'ONTOLOGY_OIDC_AUDIENCE') ?? 'gigalibs-ontology-api',
    oidcJwksUri: parseHttpsUrlWithDefault(environment, 'ONTOLOGY_OIDC_JWKS_URI', defaultJwks, allowInsecureOidc),
    oidcAlgorithms: parseAlgorithmsWithDefault(environment, 'ONTOLOGY_OIDC_ALGORITHMS', ['RS256']),
    tenantClaim: parseClaimNameWithDefault(environment, 'ONTOLOGY_OIDC_TENANT_CLAIM', 'tenant_id'),
    permissionsClaim: parseClaimNameWithDefault(environment, 'ONTOLOGY_OIDC_PERMISSIONS_CLAIM', 'permissions'),
  });
}

function parseDatabaseUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('Database URL must use postgresql:// or postgres://.');
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('Database URL must include a host and database name.');
  }
  return raw;
}

function parseOriginsWithDefault(environment: NodeJS.ProcessEnv, key: string, fallback: readonly string[]): readonly string[] {
  const raw = environment[key]?.trim();
  if (!raw) return Object.freeze(fallback);
  const origins = raw.split(',').map((v) => v.trim()).filter(Boolean);
  if (origins.length === 0) return Object.freeze(fallback);
  return Object.freeze(origins);
}

function parseHttpsUrlWithDefault(environment: NodeJS.ProcessEnv, key: string, fallback: string, allowInsecure: boolean): string {
  const raw = environment[key]?.trim() ?? fallback;
  const parsed = new URL(raw);
  if (parsed.protocol === 'http:' && allowInsecure) return raw;
  if (parsed.protocol !== 'https:') throw new Error(`${key} must be an https:// URL.`);
  return raw;
}

function parseAlgorithmsWithDefault(environment: NodeJS.ProcessEnv, key: string, fallback: readonly ('RS256' | 'ES256')[]): readonly ('RS256' | 'ES256')[] {
  const raw = environment[key]?.trim();
  if (!raw) return Object.freeze(fallback);
  const items = raw.split(',').map((v) => v.trim());
  const algorithms: ('RS256' | 'ES256')[] = [];
  for (const item of items) {
    if (!SUPPORTED_OIDC_ALGORITHMS.has(item)) throw new Error(`Unsupported algorithm: ${item}`);
    algorithms.push(item as 'RS256' | 'ES256');
  }
  return Object.freeze(algorithms);
}

function parseClaimNameWithDefault(environment: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = environment[key]?.trim() ?? fallback;
  if (!CLAIM_NAME_PATTERN.test(value)) throw new Error(`${key} must be a valid claim name.`);
  return value;
}

function optionalString(environment: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = environment[key]?.trim();
  return value ? value : undefined;
}

function parseIntegerWithDefault(environment: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = environment[key]?.trim();
  if (!raw) return fallback;
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
