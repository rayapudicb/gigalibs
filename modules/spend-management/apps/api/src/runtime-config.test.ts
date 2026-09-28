import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig } from './runtime-config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  SPEND_API_HOST: '0.0.0.0',
  SPEND_API_PORT: '3500',
  SPEND_CORS_ORIGINS: 'https://spend.example.com',
  SPEND_DATABASE_URL: 'postgresql://spend_user:secret-reference@db.example.com/spend',
  SPEND_DATABASE_POOL_SIZE: '20',
  SPEND_OIDC_ISSUER: 'https://identity.example.com',
  SPEND_OIDC_AUDIENCE: 'gigalibs-spend',
  SPEND_OIDC_JWKS_URI: 'https://identity.example.com/.well-known/jwks.json',
  SPEND_OIDC_ALGORITHMS: 'RS256,ES256',
  SPEND_OIDC_TENANT_CLAIM: 'tenant_id',
  SPEND_OIDC_PERMISSIONS_CLAIM: 'permissions',
};

describe('Spend loadRuntimeConfig', () => {
  it('loads an explicit production configuration', () => {
    expect(loadRuntimeConfig(validEnvironment)).toMatchObject({
      apiPort: 3500,
      databasePoolSize: 20,
      oidcAlgorithms: ['RS256', 'ES256'],
      tenantClaim: 'tenant_id',
    });
  });

  it.each(['SPEND_DATABASE_URL', 'SPEND_OIDC_ISSUER', 'SPEND_OIDC_AUDIENCE', 'SPEND_OIDC_JWKS_URI'])(
    'fails closed when %s is absent',
    (name) => {
      const environment = { ...validEnvironment };
      delete environment[name];
      expect(() => loadRuntimeConfig(environment)).toThrow(`Required environment variable ${name} is missing.`);
    },
  );

  it('rejects insecure OIDC in production', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        SPEND_ALLOW_INSECURE_OIDC: 'true',
        SPEND_OIDC_ISSUER: 'http://identity.local',
      }),
    ).toThrow('SPEND_ALLOW_INSECURE_OIDC cannot be enabled in production.');
  });

  it('rejects unapproved signing algorithms', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, SPEND_OIDC_ALGORITHMS: 'RS256,HS256' }),
    ).toThrow('Unsupported algorithm in SPEND_OIDC_ALGORITHMS: HS256');
  });
});
