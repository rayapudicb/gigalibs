import { generateKeyPairSync } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GEOSPATIAL_SCHEMA_CONTRACT_VERSION, loadGeospatialRuntimeConfig } from './runtime-config.js';

const { publicKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { format: 'der', type: 'spki' },
  privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
});

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  GEOSPATIAL_API_HOST: '127.0.0.1',
  GEOSPATIAL_API_PORT: '4720',
  GEOSPATIAL_CORS_ORIGINS: 'http://localhost:5180',
  GEOSPATIAL_DATABASE_URL: 'postgresql://gigalibs_geospatial_runtime:secret@localhost:5440/gigalibs',
  GEOSPATIAL_DATABASE_POOL_SIZE: '10',
  GEOSPATIAL_EXPECTED_MIGRATION_VERSION: String(GEOSPATIAL_SCHEMA_CONTRACT_VERSION),
  GEOSPATIAL_PLATFORM_CONTEXT_AUDIENCE: 'gigalibs-geospatial-api',
  GEOSPATIAL_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKey.toString('base64'),
};

describe('Geospatial runtime configuration', () => {
  it('loads the exact canonical local runtime contract', () => {
    expect(loadGeospatialRuntimeConfig(validEnvironment)).toMatchObject({
      apiHost: '127.0.0.1',
      apiPort: 4720,
      databasePoolSize: 10,
      expectedMigrationVersion: GEOSPATIAL_SCHEMA_CONTRACT_VERSION,
      platformContextAudience: 'gigalibs-geospatial-api',
      corsOrigins: ['http://localhost:5180'],
    });
  });

  it.each([
    'GEOSPATIAL_API_HOST',
    'GEOSPATIAL_API_PORT',
    'GEOSPATIAL_CORS_ORIGINS',
    'GEOSPATIAL_DATABASE_URL',
    'GEOSPATIAL_DATABASE_POOL_SIZE',
    'GEOSPATIAL_EXPECTED_MIGRATION_VERSION',
    'GEOSPATIAL_PLATFORM_CONTEXT_AUDIENCE',
    'GEOSPATIAL_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64',
  ])('fails closed when %s is absent', (key) => {
    const environment = { ...validEnvironment };
    delete environment[key];
    expect(() => loadGeospatialRuntimeConfig(environment)).toThrow();
  });

  it('pins the schema contract to the last runtime-foundation migration', () => {
    const migrations = readdirSync(new URL('../../../db/runtime-foundation/', import.meta.url))
      .filter((name) => /^\d{6}_.+\.up\.sql$/.test(name))
      .sort();
    expect(GEOSPATIAL_SCHEMA_CONTRACT_VERSION).toBe(Number(migrations.at(-1)?.slice(0, 6)));
  });

  it('rejects a schema version other than the image contract', () => {
    expect(() =>
      loadGeospatialRuntimeConfig({
        ...validEnvironment,
        GEOSPATIAL_EXPECTED_MIGRATION_VERSION: String(GEOSPATIAL_SCHEMA_CONTRACT_VERSION - 1),
      }),
    ).toThrow('GEOSPATIAL_EXPECTED_MIGRATION_VERSION');
  });

  it('rejects a wildcard CORS origin and an audience alias', () => {
    expect(() =>
      loadGeospatialRuntimeConfig({ ...validEnvironment, GEOSPATIAL_CORS_ORIGINS: '*' }),
    ).toThrow('explicit origins');
    expect(() =>
      loadGeospatialRuntimeConfig({ ...validEnvironment, GEOSPATIAL_PLATFORM_CONTEXT_AUDIENCE: 'maps' }),
    ).toThrow('must equal gigalibs-geospatial-api');
  });

  it('requires a dedicated database role and password', () => {
    expect(() =>
      loadGeospatialRuntimeConfig({
        ...validEnvironment,
        GEOSPATIAL_DATABASE_URL: 'postgresql://localhost:5440/gigalibs',
      }),
    ).toThrow('dedicated role and password');
  });
});
