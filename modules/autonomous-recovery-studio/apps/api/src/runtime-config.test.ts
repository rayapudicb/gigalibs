import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime-config.js';

const validEnv = {
  NODE_ENV: 'test',
  RECOVERY_API_HOST: '127.0.0.1',
  RECOVERY_API_PORT: '4200',
  RECOVERY_CORS_ORIGINS: 'http://localhost:5180',
  RECOVERY_DATABASE_URL: 'postgresql://gigalibs:gigalibs_dev@localhost:5440/gigalibs',
  RECOVERY_DATABASE_POOL_SIZE: '10',
  RECOVERY_ALLOW_INSECURE_OIDC: 'true',
  RECOVERY_OIDC_ISSUER: 'http://127.0.0.1:4200/oidc',
  RECOVERY_OIDC_JWKS_URI: 'http://127.0.0.1:4200/oidc/jwks.json',
  RECOVERY_OIDC_AUDIENCE: 'gigalibs-recovery',
  RECOVERY_OIDC_ALGORITHMS: 'RS256',
  RECOVERY_OIDC_TENANT_CLAIM: 'tenant_id',
  RECOVERY_OIDC_PERMISSIONS_CLAIM: 'permissions',
};

describe('Recovery runtime config validation', () => {
  it('accepts a fully valid configuration', () => {
    const config = loadRuntimeConfig(validEnv);
    expect(config.apiPort).toBe(4200);
    expect(config.databaseUrl).toBe('postgresql://gigalibs:gigalibs_dev@localhost:5440/gigalibs');
    expect(config.oidcAlgorithms).toEqual(['RS256']);
  });

  it('rejects missing RECOVERY_DATABASE_URL', () => {
    const env = { ...validEnv };
    delete (env as any).RECOVERY_DATABASE_URL;
    expect(() => loadRuntimeConfig(env)).toThrow('RECOVERY_DATABASE_URL');
  });

  it('rejects a non-postgresql URL scheme', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnv, RECOVERY_DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow('RECOVERY_DATABASE_URL must use postgresql://');
  });

  it('rejects a RECOVERY_DATABASE_URL with no database name', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnv, RECOVERY_DATABASE_URL: 'postgresql://localhost/' }),
    ).toThrow('RECOVERY_DATABASE_URL must include a host and database name');
  });

  it('rejects an unsupported OIDC algorithm', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnv, RECOVERY_OIDC_ALGORITHMS: 'HS256' }),
    ).toThrow('Unsupported algorithm');
  });

  it('rejects RECOVERY_ALLOW_INSECURE_OIDC=true in production', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnv, NODE_ENV: 'production', RECOVERY_ALLOW_INSECURE_OIDC: 'true' }),
    ).toThrow('RECOVERY_ALLOW_INSECURE_OIDC cannot be enabled in production');
  });

  it('rejects an empty RECOVERY_CORS_ORIGINS list', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnv, RECOVERY_CORS_ORIGINS: '   ' }),
    ).toThrow('RECOVERY_CORS_ORIGINS');
  });
});
