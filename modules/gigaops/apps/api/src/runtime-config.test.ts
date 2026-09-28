import { generateKeyPairSync } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORKFORCE_SCHEMA_CONTRACT_VERSION, loadGigaOpsRuntimeConfig } from './runtime-config.js';

const { publicKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { format: 'der', type: 'spki' },
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
});

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  WORKFORCE_API_HOST: '127.0.0.1',
  WORKFORCE_API_PORT: '4700',
  WORKFORCE_CORS_ORIGINS: 'http://localhost:5180',
  WORKFORCE_DATABASE_URL:
    'postgresql://gigalibs_workforce_runtime:secret@localhost:5440/gigalibs',
  WORKFORCE_DATABASE_POOL_SIZE: '10',
  WORKFORCE_EXPECTED_MIGRATION_VERSION: String(WORKFORCE_SCHEMA_CONTRACT_VERSION),
  WORKFORCE_PLATFORM_CONTEXT_AUDIENCE: 'gigalibs-workforce-api',
  WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKey.toString('base64'),
};

describe('GigaOps Workforce runtime configuration', () => {
  it('loads the exact canonical local runtime contract', () => {
    expect(loadGigaOpsRuntimeConfig(validEnvironment)).toMatchObject({
      apiHost: '127.0.0.1',
      apiPort: 4700,
      databasePoolSize: 10,
      expectedMigrationVersion: WORKFORCE_SCHEMA_CONTRACT_VERSION,
      platformContextAudience: 'gigalibs-workforce-api',
      corsOrigins: ['http://localhost:5180'],
    });
  });

  it.each([
    'WORKFORCE_API_HOST',
    'WORKFORCE_API_PORT',
    'WORKFORCE_CORS_ORIGINS',
    'WORKFORCE_DATABASE_URL',
    'WORKFORCE_DATABASE_POOL_SIZE',
    'WORKFORCE_EXPECTED_MIGRATION_VERSION',
    'WORKFORCE_PLATFORM_CONTEXT_AUDIENCE',
    'WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64',
  ])('fails closed when %s is absent', (key) => {
    const environment = { ...validEnvironment };
    delete environment[key];
    expect(() => loadGigaOpsRuntimeConfig(environment)).toThrow();
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() =>
      loadGigaOpsRuntimeConfig({ ...validEnvironment, WORKFORCE_CORS_ORIGINS: '*' }),
    ).toThrow('explicit origins');
  });

  it('rejects an audience alias instead of silently changing the service identity', () => {
    expect(() =>
      loadGigaOpsRuntimeConfig({
        ...validEnvironment,
        WORKFORCE_PLATFORM_CONTEXT_AUDIENCE: 'gigaops',
      }),
    ).toThrow('must equal gigalibs-workforce-api');
  });

  it('rejects database URLs without a dedicated credential', () => {
    expect(() =>
      loadGigaOpsRuntimeConfig({
        ...validEnvironment,
        WORKFORCE_DATABASE_URL: 'postgresql://localhost:5440/gigalibs',
      }),
    ).toThrow('dedicated role and password');
  });

  it('keeps reference pay packs off unless explicitly enabled', () => {
    expect(loadGigaOpsRuntimeConfig(validEnvironment).payReferencePacks).toBe(false);
    expect(loadGigaOpsRuntimeConfig({ ...validEnvironment, WORKFORCE_PAY_REFERENCE_PACKS: 'enabled' }).payReferencePacks).toBe(true);
    expect(() => loadGigaOpsRuntimeConfig({ ...validEnvironment, WORKFORCE_PAY_REFERENCE_PACKS: 'yes' })).toThrow(/enabled or disabled/);
  });

  it('pins the schema contract to the last runtime-foundation migration', () => {
    const migrations = readdirSync(new URL('../../../db/runtime-foundation/', import.meta.url))
      .filter((name) => /^\d{6}_.+\.up\.sql$/.test(name))
      .sort();
    expect(WORKFORCE_SCHEMA_CONTRACT_VERSION).toBe(Number(migrations.at(-1)?.slice(0, 6)));
  });

  it('rejects a schema version other than the image contract', () => {
    expect(() =>
      loadGigaOpsRuntimeConfig({
        ...validEnvironment,
        WORKFORCE_EXPECTED_MIGRATION_VERSION: String(WORKFORCE_SCHEMA_CONTRACT_VERSION - 1),
      }),
    ).toThrow('WORKFORCE_EXPECTED_MIGRATION_VERSION');
  });

  it('rejects ambiguous key representations', () => {
    expect(() =>
      loadGigaOpsRuntimeConfig({
        ...validEnvironment,
        WORKFORCE_PLATFORM_CONTEXT_PUBLIC_KEY: 'also-configured',
      }),
    ).toThrow('exactly one');
  });
});
