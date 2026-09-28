/**
 * WI-OI-021 — Tax Runtime-Config Validation Tests
 *
 * Verifies that loadRuntimeConfig() fails closed for missing or invalid
 * environment variables and accepts valid production and development configs.
 */
import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime-config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  TAX_API_HOST: '127.0.0.1',
  TAX_API_PORT: '3600',
  TAX_CORS_ORIGINS: 'https://tax.example.com',
  TAX_DATABASE_URL: 'postgresql://tax_user:secret@localhost:5440/gigalibs',
  TAX_DATABASE_POOL_SIZE: '10',
  TAX_OIDC_ISSUER: 'https://identity.example.com',
  TAX_OIDC_AUDIENCE: 'gigalibs-tax',
  TAX_OIDC_JWKS_URI: 'https://identity.example.com/.well-known/jwks.json',
  TAX_OIDC_ALGORITHMS: 'RS256,ES256',
  TAX_OIDC_TENANT_CLAIM: 'tenant_id',
  TAX_OIDC_PERMISSIONS_CLAIM: 'permissions',
};

describe('Tax loadRuntimeConfig', () => {
  it('loads valid production configuration', () => {
    const config = loadRuntimeConfig(validEnvironment);
    expect(config).toMatchObject({
      nodeEnv: 'production',
      apiPort: 3600,
      databasePoolSize: 10,
      oidcAlgorithms: ['RS256', 'ES256'],
      tenantClaim: 'tenant_id',
    });
  });

  it.each(['TAX_DATABASE_URL', 'TAX_OIDC_ISSUER', 'TAX_OIDC_AUDIENCE', 'TAX_OIDC_JWKS_URI'])(
    'fails closed when %s is absent',
    (name) => {
      const environment = { ...validEnvironment };
      delete environment[name];
      expect(() => loadRuntimeConfig(environment)).toThrow();
    },
  );

  it('rejects insecure OIDC in production', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        TAX_ALLOW_INSECURE_OIDC: 'true',
        TAX_OIDC_ISSUER: 'http://identity.local',
      }),
    ).toThrow('cannot be enabled in production');
  });

  it('rejects unapproved signing algorithms', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, TAX_OIDC_ALGORITHMS: 'RS256,HS256' }),
    ).toThrow('Unsupported algorithm');
  });

  it('accepts insecure OIDC when NODE_ENV is development', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        NODE_ENV: 'development',
        TAX_ALLOW_INSECURE_OIDC: 'true',
        TAX_OIDC_ISSUER: 'http://localhost:3600/oidc',
        TAX_OIDC_JWKS_URI: 'http://localhost:3600/oidc/jwks.json',
      }),
    ).not.toThrow();
  });

  it('rejects invalid database URL scheme', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        TAX_DATABASE_URL: 'mysql://localhost:3306/db',
      }),
    ).toThrow('must use postgresql:// or postgres://');
  });

  it('rejects empty CORS origins', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, TAX_CORS_ORIGINS: '  ' }),
    ).toThrow();
  });
});
