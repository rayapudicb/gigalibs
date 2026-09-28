/**
 * WI-OI-033 — E-Signature Runtime-Config Validation Tests
 */
import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime-config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  ESIGN_API_HOST: '127.0.0.1',
  ESIGN_API_PORT: '4500',
  ESIGN_CORS_ORIGINS: 'https://esign.example.com',
  ESIGN_DATABASE_URL: 'postgresql://esign_user:secret@localhost:5440/gigalibs',
  ESIGN_DATABASE_POOL_SIZE: '10',
  ESIGN_OIDC_ISSUER: 'https://identity.example.com',
  ESIGN_OIDC_AUDIENCE: 'gigalibs-esignature-api',
  ESIGN_OIDC_JWKS_URI: 'https://identity.example.com/.well-known/jwks.json',
  ESIGN_OIDC_ALGORITHMS: 'RS256,ES256',
  ESIGN_OIDC_TENANT_CLAIM: 'tenant_id',
  ESIGN_OIDC_PERMISSIONS_CLAIM: 'permissions',
};

describe('Esign loadRuntimeConfig', () => {
  it('loads valid production configuration', () => {
    const config = loadRuntimeConfig(validEnvironment);
    expect(config).toMatchObject({
      nodeEnv: 'production',
      apiPort: 4500,
      databasePoolSize: 10,
      oidcAlgorithms: ['RS256', 'ES256'],
      tenantClaim: 'tenant_id',
    });
  });

  it.each(['ESIGN_DATABASE_URL', 'ESIGN_OIDC_ISSUER', 'ESIGN_OIDC_AUDIENCE', 'ESIGN_OIDC_JWKS_URI'])(
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
        ESIGN_ALLOW_INSECURE_OIDC: 'true',
        ESIGN_OIDC_ISSUER: 'http://identity.local',
      }),
    ).toThrow('cannot be enabled in production');
  });

  it('rejects unapproved signing algorithms', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, ESIGN_OIDC_ALGORITHMS: 'RS256,HS256' }),
    ).toThrow('Unsupported OIDC algorithm');
  });

  it('accepts insecure OIDC when NODE_ENV is development', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        NODE_ENV: 'development',
        ESIGN_ALLOW_INSECURE_OIDC: 'true',
        ESIGN_OIDC_ISSUER: 'http://localhost:4500/oidc',
        ESIGN_OIDC_JWKS_URI: 'http://localhost:4500/oidc/jwks.json',
      }),
    ).not.toThrow();
  });

  it('rejects invalid database URL scheme', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        ESIGN_DATABASE_URL: 'mysql://localhost:3306/db',
      }),
    ).toThrow('must use postgresql:// or postgres://');
  });

  it('rejects empty CORS origins', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, ESIGN_CORS_ORIGINS: '  ' }),
    ).toThrow();
  });
});
