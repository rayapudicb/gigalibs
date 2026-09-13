import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime-config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  AR_API_HOST: '0.0.0.0',
  AR_API_PORT: '3400',
  AR_CORS_ORIGINS: 'https://ar.example.com',
  AR_DATABASE_URL: 'postgresql://ar_user:secret-reference@db.example.com/ar',
  AR_DATABASE_POOL_SIZE: '20',
  AR_OIDC_ISSUER: 'https://identity.example.com',
  AR_OIDC_AUDIENCE: 'gigalibs-ar',
  AR_OIDC_JWKS_URI: 'https://identity.example.com/.well-known/jwks.json',
  AR_OIDC_ALGORITHMS: 'RS256,ES256',
  AR_OIDC_TENANT_CLAIM: 'tenant_id',
  AR_OIDC_PERMISSIONS_CLAIM: 'permissions',
};

describe('loadRuntimeConfig', () => {
  it('loads an explicit production configuration', () => {
    expect(loadRuntimeConfig(validEnvironment)).toMatchObject({
      apiPort: 3400,
      databasePoolSize: 20,
      oidcAlgorithms: ['RS256', 'ES256'],
      tenantClaim: 'tenant_id',
    });
  });

  it.each(['AR_DATABASE_URL', 'AR_OIDC_ISSUER', 'AR_OIDC_AUDIENCE', 'AR_OIDC_JWKS_URI'])(
    'fails closed when %s is absent',
    (name) => {
      const environment = { ...validEnvironment };
      delete environment[name];
      expect(() => loadRuntimeConfig(environment)).toThrow(`${name} must be configured.`);
    },
  );

  it('rejects insecure OIDC in production', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        AR_ALLOW_INSECURE_OIDC: 'true',
        AR_OIDC_ISSUER: 'http://identity.local',
      }),
    ).toThrow('cannot be enabled in production');
  });

  it('rejects unapproved signing algorithms', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, AR_OIDC_ALGORITHMS: 'RS256,HS256' }),
    ).toThrow('only RS256 and/or ES256');
  });
});
