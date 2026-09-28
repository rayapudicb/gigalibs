/**
 * WI-OI-034 / WI-OI-064a — Analytics Studio runtime-config validation. Authority is the BFF-signed
 * PlatformContextV1, so the only trust anchor is an Ed25519 public key; there is no OIDC or dev issuer.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_SCHEMA_CONTRACT_VERSION, loadRuntimeConfig } from './runtime-config.js';

const { publicKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  ANALYTICS_API_HOST: '127.0.0.1',
  ANALYTICS_API_PORT: '4400',
  ANALYTICS_CORS_ORIGINS: 'https://analytics.example.com',
  ANALYTICS_DATABASE_URL: 'postgresql://analytics_user:secret@localhost:5440/gigalibs',
  ANALYTICS_DATABASE_POOL_SIZE: '10',
  ANALYTICS_EXPECTED_MIGRATION_VERSION: String(ANALYTICS_SCHEMA_CONTRACT_VERSION),
  ANALYTICS_PLATFORM_CONTEXT_AUDIENCE: 'gigalibs-analytics-api',
  ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: Buffer.from(publicKey).toString('base64'),
};

describe('Analytics loadRuntimeConfig', () => {
  it('loads a valid configuration with the signed-context key as PEM', () => {
    const config = loadRuntimeConfig(validEnvironment);
    expect(config).toMatchObject({
      nodeEnv: 'production',
      apiPort: 4400,
      databasePoolSize: 10,
      expectedMigrationVersion: ANALYTICS_SCHEMA_CONTRACT_VERSION,
      platformContextAudience: 'gigalibs-analytics-api',
    });
    expect(config.platformContextPublicKey).toContain('BEGIN PUBLIC KEY');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    'ANALYTICS_DATABASE_URL',
    'ANALYTICS_PLATFORM_CONTEXT_AUDIENCE',
    'ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64',
  ])('fails closed when %s is absent', (name) => {
    const environment = { ...validEnvironment };
    delete environment[name];
    expect(() => loadRuntimeConfig(environment)).toThrow();
  });

  it('accepts only the Analytics audience', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, ANALYTICS_PLATFORM_CONTEXT_AUDIENCE: 'gigalibs-geospatial-api' }),
    ).toThrow('must equal gigalibs-analytics-api');
  });

  it('rejects a non-Ed25519 key and ambiguous key configuration', () => {
    const rsa = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: Buffer.from(rsa.publicKey).toString('base64'),
      }),
    ).toThrow('Ed25519');
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, ANALYTICS_PLATFORM_CONTEXT_PUBLIC_KEY: 'pem' }),
    ).toThrow('exactly one');
  });

  it('ignores the removed development OIDC switch instead of re-enabling a dev issuer', () => {
    const config = loadRuntimeConfig({ ...validEnvironment, ANALYTICS_ALLOW_INSECURE_OIDC: 'true' });
    expect(config).not.toHaveProperty('allowInsecureOidc');
  });

  it('rejects a stale migration contract', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        ANALYTICS_EXPECTED_MIGRATION_VERSION: String(ANALYTICS_SCHEMA_CONTRACT_VERSION - 1),
      }),
    ).toThrow();
  });

  it('pins the schema contract to the last migration file', () => {
    const migrations = readdirSync(resolve(__dirname, '../../../db/migrations')).filter((name) => name.endsWith('.up.sql'));
    const latest = Math.max(...migrations.map((name) => Number.parseInt(name.slice(0, 6), 10)));
    expect(ANALYTICS_SCHEMA_CONTRACT_VERSION).toBe(latest);
  });

  it('rejects an invalid database URL scheme and empty CORS origins', () => {
    expect(() =>
      loadRuntimeConfig({ ...validEnvironment, ANALYTICS_DATABASE_URL: 'mysql://user:pass@localhost/db' }),
    ).toThrow();
    expect(() => loadRuntimeConfig({ ...validEnvironment, ANALYTICS_CORS_ORIGINS: ' , ' })).toThrow();
  });
});
