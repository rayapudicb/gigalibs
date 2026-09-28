/**
 * WI-OI-038 — CMMS runtime configuration: signed-context only, exact audience and schema contract.
 */
import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CMMS_AUDIENCE, CMMS_SCHEMA_CONTRACT_VERSION, loadRuntimeConfig } from './runtime-config.js';

const { publicKey } = generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CMMS_API_HOST: '0.0.0.0',
  CMMS_API_PORT: '4200',
  CMMS_CORS_ORIGINS: 'http://localhost:5180',
  CMMS_DATABASE_URL: 'postgresql://gigalibs_cmms_runtime:secret@localhost:5440/gigalibs',
  CMMS_DATABASE_POOL_SIZE: '10',
  CMMS_EXPECTED_MIGRATION_VERSION: String(CMMS_SCHEMA_CONTRACT_VERSION),
  CMMS_PLATFORM_CONTEXT_AUDIENCE: CMMS_AUDIENCE,
  CMMS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: publicKeyBase64,
};

describe('CMMS loadRuntimeConfig', () => {
  it('loads the signed-context runtime configuration', () => {
    const config = loadRuntimeConfig(valid);
    expect(config).toMatchObject({
      apiPort: 4200,
      databasePoolSize: 10,
      expectedMigrationVersion: CMMS_SCHEMA_CONTRACT_VERSION,
      platformContextAudience: 'gigalibs-cmms-api',
    });
    expect(config.platformContextPublicKey).toContain('BEGIN PUBLIC KEY');
    expect(Object.keys(config)).not.toContain('oidcIssuer');
  });

  it('pins the audience and the schema contract version', () => {
    expect(() => loadRuntimeConfig({ ...valid, CMMS_PLATFORM_CONTEXT_AUDIENCE: 'gigalibs-workforce-api' })).toThrow(/must equal/);
    expect(() => loadRuntimeConfig({ ...valid, CMMS_EXPECTED_MIGRATION_VERSION: String(CMMS_SCHEMA_CONTRACT_VERSION - 1) })).toThrow(
      new RegExp(`between ${CMMS_SCHEMA_CONTRACT_VERSION} and ${CMMS_SCHEMA_CONTRACT_VERSION}`),
    );
    expect(() => loadRuntimeConfig({ ...valid, CMMS_EXPECTED_MIGRATION_VERSION: '10abc' })).toThrow();
  });

  it('requires exactly one Ed25519 verification key', () => {
    const { publicKey: rsa } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(() =>
      loadRuntimeConfig({ ...valid, CMMS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: rsa.export({ format: 'der', type: 'spki' }).toString('base64') }),
    ).toThrow(/Ed25519/);
    expect(() =>
      loadRuntimeConfig({ ...valid, CMMS_PLATFORM_CONTEXT_PUBLIC_KEY: publicKey.export({ format: 'pem', type: 'spki' }).toString() }),
    ).toThrow(/exactly one/);
    const { CMMS_PLATFORM_CONTEXT_PUBLIC_KEY_BASE64: _omitted, ...withoutKey } = valid;
    expect(() => loadRuntimeConfig(withoutKey)).toThrow(/exactly one/);
  });

  it('rejects invalid database URLs and empty CORS origins', () => {
    expect(() => loadRuntimeConfig({ ...valid, CMMS_DATABASE_URL: 'mysql://localhost/gigalibs' })).toThrow(/postgresql/);
    expect(() => loadRuntimeConfig({ ...valid, CMMS_CORS_ORIGINS: ' , ' })).toThrow(/at least one origin/);
  });
});
