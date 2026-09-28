/**
 * WI-OI-022 — Multi-Currency Runtime-Config Validation Tests
 */
import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime-config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  CURRENCY_API_HOST: '127.0.0.1',
  CURRENCY_API_PORT: '3700',
  CURRENCY_CORS_ORIGINS: 'https://currency.example.com',
  CURRENCY_DATABASE_URL: 'postgresql://currency_user:secret@localhost:5440/gigalibs',
  CURRENCY_DATABASE_POOL_SIZE: '10',
  CURRENCY_OIDC_ISSUER: 'https://identity.example.com',
  CURRENCY_OIDC_AUDIENCE: 'gigalibs-currency',
  CURRENCY_OIDC_JWKS_URI: 'https://identity.example.com/.well-known/jwks.json',
  CURRENCY_OIDC_ALGORITHMS: 'RS256,ES256',
  CURRENCY_OIDC_TENANT_CLAIM: 'tenant_id',
  CURRENCY_OIDC_PERMISSIONS_CLAIM: 'permissions',
};

describe('Currency loadRuntimeConfig', () => {
  it('loads valid production configuration', () => {
    const config = loadRuntimeConfig(validEnvironment);
    expect(config).toMatchObject({
      nodeEnv: 'production',
      apiPort: 3700,
      databasePoolSize: 10,
      oidcAlgorithms: ['RS256', 'ES256'],
      tenantClaim: 'tenant_id',
    });
  });

  it.each(['CURRENCY_DATABASE_URL', 'CURRENCY_OIDC_ISSUER', 'CURRENCY_OIDC_AUDIENCE', 'CURRENCY_OIDC_JWKS_URI'])(
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
        CURRENCY_ALLOW_INSECURE_OIDC: 'true',
        CURRENCY_OIDC_ISSUER: 'http://identity.local',
      }),
    ).toThrow('cannot be enabled in production');
  });

  it('rejects unapproved signing algorithms', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, CURRENCY_OIDC_ALGORITHMS: 'RS256,HS256' }),
    ).toThrow('Unsupported algorithm');
  });

  it('accepts insecure OIDC when NODE_ENV is development', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        NODE_ENV: 'development',
        CURRENCY_ALLOW_INSECURE_OIDC: 'true',
        CURRENCY_OIDC_ISSUER: 'http://localhost:3700/oidc',
        CURRENCY_OIDC_JWKS_URI: 'http://localhost:3700/oidc/jwks.json',
      }),
    ).not.toThrow();
  });

  it('rejects invalid database URL scheme', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        CURRENCY_DATABASE_URL: 'mysql://localhost:3306/db',
      }),
    ).toThrow('must use postgresql:// or postgres://');
  });

  it('rejects empty CORS origins', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, CURRENCY_CORS_ORIGINS: '  ' }),
    ).toThrow();
  });
});
