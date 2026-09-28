import { describe, expect, it } from 'vitest';
import { loadConnectorHubRuntimeConfig } from './runtime-config.js';

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  CONNECTOR_HUB_API_HOST: '0.0.0.0',
  CONNECTOR_HUB_API_PORT: '4100',
  CONNECTOR_HUB_CORS_ORIGINS: 'http://localhost:5180,http://127.0.0.1:5180',
  CONNECTORS_DATABASE_URL: 'postgresql://connectors_runtime:secret@localhost:5440/gigalibs',
  CONNECTOR_HUB_DATABASE_POOL_SIZE: '10',
  CONNECTOR_VAULT_KEY: 'local-test-key-that-is-at-least-32-bytes-long',
  CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION: '4',
  CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS: 'example.com,api.example.net',
  CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND: 'false',
};

describe('Connector Hub runtime configuration', () => {
  it('loads an explicit local configuration', () => {
    const config = loadConnectorHubRuntimeConfig(validEnvironment);
    expect(config.apiPort).toBe(4100);
    expect(config.databasePoolSize).toBe(10);
    expect(config.corsOrigins).toEqual([
      'http://localhost:5180',
      'http://127.0.0.1:5180',
    ]);
  });

  it.each([
    'CONNECTOR_HUB_API_HOST',
    'CONNECTOR_HUB_API_PORT',
    'CONNECTOR_HUB_CORS_ORIGINS',
    'CONNECTORS_DATABASE_URL',
    'CONNECTOR_HUB_DATABASE_POOL_SIZE',
    'CONNECTOR_VAULT_KEY',
    'CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION',
    'CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS',
    'CONNECTOR_HUB_ALLOW_INSECURE_OUTBOUND',
  ])('fails closed when %s is absent', (name) => {
    const environment = { ...validEnvironment };
    delete environment[name];
    expect(() => loadConnectorHubRuntimeConfig(environment)).toThrow();
  });

  it('rejects invalid outbound host entries', () => {
    expect(() =>
      loadConnectorHubRuntimeConfig({
        ...validEnvironment,
        CONNECTOR_HUB_ALLOWED_OUTBOUND_HOSTS: 'https://example.com',
      }),
    ).toThrow('invalid hostname');
  });

  it('rejects wildcard CORS and non-origin paths', () => {
    expect(() =>
      loadConnectorHubRuntimeConfig({
        ...validEnvironment,
        CONNECTOR_HUB_CORS_ORIGINS: '*',
      }),
    ).toThrow();
    expect(() =>
      loadConnectorHubRuntimeConfig({
        ...validEnvironment,
        CONNECTOR_HUB_CORS_ORIGINS: 'http://localhost:5180/path',
      }),
    ).toThrow();
  });

  it('rejects embedded and undersized vault keys', () => {
    expect(() =>
      loadConnectorHubRuntimeConfig({ ...validEnvironment, CONNECTOR_VAULT_KEY: 'short' }),
    ).toThrow('at least 32 bytes');
  });

  it('rejects an unexpected migration contract', () => {
    expect(() =>
      loadConnectorHubRuntimeConfig({
        ...validEnvironment,
        CONNECTOR_HUB_EXPECTED_MIGRATION_VERSION: '3',
      }),
    ).toThrow('between 4 and 4');
  });
});
