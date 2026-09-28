import { parseAes256KeyRing } from '@gigalibs/crypto';
import { ConfigurationKeySchema } from '@gigalibs/contracts';

try {
  process.loadEnvFile?.('.env');
} catch {}
try {
  process.loadEnvFile?.('../../.env');
} catch {}

function requirePort(name: string): number {
  const rawValue = process.env[name];
  const parsed = Number(rawValue);
  if (!rawValue || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be configured as a valid TCP port.`);
  }
  return parsed;
}

function requirePositiveInteger(name: string): number {
  const rawValue = process.env[name];
  const parsed = Number(rawValue);
  if (!rawValue || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be configured as a positive integer.`);
  }
  return parsed;
}

function requireCorsOrigins(): string[] {
  const rawValue = process.env.CORS_ORIGINS;
  if (!rawValue) {
    throw new Error('CORS_ORIGINS must contain at least one trusted origin.');
  }

  const origins = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS must contain at least one trusted origin.');
  }
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`CORS origin '${origin}' must be an absolute HTTP(S) origin.`);
    }
  }
  return origins;
}

function requireBoolean(name: string): boolean {
  const value = requireString(name).toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be configured as true or false.`);
}

function requireHostAllowlist(name: string): string[] {
  const rawValue = process.env[name];
  if (rawValue === undefined) throw new Error(`${name} must be configured.`);
  const hosts = rawValue
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  for (const host of hosts) {
    if (!/^(?:\*\.)?[a-z0-9.-]+$/.test(host) || host.includes('..')) {
      throw new Error(`Invalid connector host allowlist entry '${host}'.`);
    }
  }
  return hosts;
}

function requirePortAllowlist(name: string): Set<number> {
  const rawValue = requireString(name);
  const ports = rawValue.split(',').map((port) => Number(port.trim()));
  if (
    ports.length === 0 ||
    ports.some((port) => !Number.isSafeInteger(port) || port < 1 || port > 65_535)
  ) {
    throw new Error(`${name} must be a comma-separated list of valid ports.`);
  }
  return new Set(ports);
}

function requireStorageEndpoint(): string {
  const rawValue = requireString('STORAGE_ENDPOINT');
  const endpoint = new URL(rawValue);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('STORAGE_ENDPOINT must be an HTTP(S) URL without embedded credentials.');
  }
  if (endpoint.protocol === 'http:' && !requireBoolean('STORAGE_ALLOW_INSECURE')) {
    throw new Error('STORAGE_ENDPOINT must use HTTPS unless STORAGE_ALLOW_INSECURE is true.');
  }
  return endpoint.toString().replace(/\/$/, '');
}

function requireStorageBucket(): string {
  const value = requireString('STORAGE_BUCKET');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value) || value.includes('..')) {
    throw new Error('STORAGE_BUCKET must be a valid S3 bucket name.');
  }
  return value;
}

function requireConfigurationKey(name: string): string {
  const parsed = ConfigurationKeySchema.safeParse(process.env[name]);
  if (!parsed.success) {
    throw new Error(`${name} must be configured as a valid configuration key.`);
  }
  return parsed.data;
}

const controlPayloadKeyVersion = requireString('CONTROL_PAYLOAD_KEY_VERSION');
const controlPayloadKeyRing = parseAes256KeyRing(
  controlPayloadKeyVersion,
  requireString('CONTROL_PAYLOAD_ENCRYPTION_KEY'),
  process.env.CONTROL_PAYLOAD_PREVIOUS_KEYS_JSON,
);
const controlPayloadEncryptionKeyBase64 = controlPayloadKeyRing.get(controlPayloadKeyVersion);
if (!controlPayloadEncryptionKeyBase64) {
  throw new Error('The active control-payload encryption key is not loaded.');
}

export const runtimeConfig = Object.freeze({
  apiHost: requireString('API_HOST'),
  apiPort: requirePort('API_PORT'),
  corsOrigins: requireCorsOrigins(),
  workflowSchemaVersion: requireString('WORKFLOW_SCHEMA_VERSION'),
  workflowCompilerVersion: requireString('WORKFLOW_COMPILER_VERSION'),
  workflowPublishMaxRetries: requirePositiveInteger('WORKFLOW_PUBLISH_MAX_RETRIES'),
  executionEventSourceId: requireString('EXECUTION_EVENT_SOURCE_ID'),
  executionEventSigningSecret: requireSecret('EXECUTION_EVENT_SIGNING_SECRET'),
  executionEventMaxSkewSeconds: requirePositiveInteger('EXECUTION_EVENT_MAX_SKEW_SECONDS'),
  connectorHttpAllowedHosts: requireHostAllowlist('CONNECTOR_HTTP_ALLOWED_HOSTS'),
  connectorHttpAllowedPorts: requirePortAllowlist('CONNECTOR_HTTP_ALLOWED_PORTS'),
  connectorHttpAllowInsecure: requireBoolean('CONNECTOR_HTTP_ALLOW_INSECURE'),
  connectorHttpAllowPrivateNetworks: requireBoolean('CONNECTOR_HTTP_ALLOW_PRIVATE_NETWORKS'),
  connectorHttpTimeoutSeconds: requirePositiveInteger('CONNECTOR_HTTP_TIMEOUT_SECONDS'),
  connectorHttpMaxResponseBytes: requirePositiveInteger('CONNECTOR_HTTP_MAX_RESPONSE_BYTES'),
  connectorFailureThreshold: requirePositiveInteger('CONNECTOR_FAILURE_THRESHOLD'),
  connectorCircuitCooldownSeconds: requirePositiveInteger('CONNECTOR_CIRCUIT_COOLDOWN_SECONDS'),
  connectorDatabaseAllowedHosts: requireHostAllowlist('CONNECTOR_DATABASE_ALLOWED_HOSTS'),
  connectorDatabaseAllowedPorts: requirePortAllowlist('CONNECTOR_DATABASE_ALLOWED_PORTS'),
  connectorDatabaseAllowPrivateNetworks: requireBoolean(
    'CONNECTOR_DATABASE_ALLOW_PRIVATE_NETWORKS',
  ),
  storageEndpoint: requireStorageEndpoint(),
  storageRegion: requireString('STORAGE_REGION'),
  storageBucket: requireStorageBucket(),
  storageAccessKey: requireString('STORAGE_ACCESS_KEY'),
  storageSecretKey: requireString('STORAGE_SECRET_KEY'),
  storageForcePathStyle: requireBoolean('STORAGE_FORCE_PATH_STYLE'),
  storagePresignSeconds: requirePositiveInteger('STORAGE_PRESIGN_SECONDS'),
  storageMaxFileBytes: requirePositiveInteger('STORAGE_MAX_FILE_BYTES'),
  storageCleanupIntervalSeconds: requirePositiveInteger('STORAGE_CLEANUP_INTERVAL_SECONDS'),
  storageCleanupBatchSize: requirePositiveInteger('STORAGE_CLEANUP_BATCH_SIZE'),
  retentionWorkerIntervalSeconds: requirePositiveInteger('RETENTION_WORKER_INTERVAL_SECONDS'),
  retentionEnvironmentBatchSize: requirePositiveInteger('RETENTION_ENVIRONMENT_BATCH_SIZE'),
  retentionEventBatchSize: requirePositiveInteger('RETENTION_EVENT_BATCH_SIZE'),
  controlPayloadEncryptionKey: Buffer.from(controlPayloadEncryptionKeyBase64, 'base64'),
  controlPayloadDecryptionKeys: new Map(
    [...controlPayloadKeyRing].map(([version, encoded]) => [
      version,
      Buffer.from(encoded, 'base64'),
    ]),
  ) as ReadonlyMap<string, Buffer>,
  controlPayloadKeyVersion,
  controlOutboxPollIntervalSeconds: requirePositiveInteger('CONTROL_OUTBOX_POLL_INTERVAL_SECONDS'),
  controlOutboxBatchSize: requirePositiveInteger('CONTROL_OUTBOX_BATCH_SIZE'),
  controlOutboxClaimTimeoutSeconds: requirePositiveInteger('CONTROL_OUTBOX_CLAIM_TIMEOUT_SECONDS'),
  controlOutboxMaxAttempts: requirePositiveInteger('CONTROL_OUTBOX_MAX_ATTEMPTS'),
  controlOutboxRetryBaseSeconds: requirePositiveInteger('CONTROL_OUTBOX_RETRY_BASE_SECONDS'),
  controlOutboxRetryMaxSeconds: requirePositiveInteger('CONTROL_OUTBOX_RETRY_MAX_SECONDS'),
  observabilityMetricsToken: requireSecret('OBSERVABILITY_METRICS_TOKEN'),
  configurationRuntimeEnvironmentKey: requireConfigurationKey(
    'CONFIGURATION_RUNTIME_ENVIRONMENT_KEY',
  ),
});

function requireString(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

function requireSecret(name: string): string {
  const value = requireString(name);
  if (value.length < 32) throw new Error(`${name} must contain at least 32 characters.`);
  return value;
}
