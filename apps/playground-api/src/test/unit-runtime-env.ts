import { randomBytes } from 'node:crypto';

/** Minimal control-plane env for unit specs that import modules pulling in runtime-config. */
export function ensurePlaygroundUnitRuntimeEnv(): void {
  const secret = randomBytes(32).toString('base64url');
  const set = (name: string, value: string) => {
    if (!process.env[name]?.trim()) process.env[name] = value;
  };
  set('API_HOST', '127.0.0.1');
  set('API_PORT', '3333');
  set('CORS_ORIGINS', 'https://console.example.test');
  set('WORKFLOW_SCHEMA_VERSION', '1.0');
  set('WORKFLOW_COMPILER_VERSION', '1.0');
  set('WORKFLOW_PUBLISH_MAX_RETRIES', '3');
  set('EXECUTION_EVENT_SOURCE_ID', 'execution-plane-test');
  set('EXECUTION_EVENT_SIGNING_SECRET', `${secret}${secret}`.slice(0, 64));
  set('EXECUTION_EVENT_MAX_SKEW_SECONDS', '300');
  set('CONNECTOR_HTTP_ALLOWED_HOSTS', '');
  set('CONNECTOR_HTTP_ALLOWED_PORTS', '443');
  set('CONNECTOR_HTTP_ALLOW_INSECURE', 'false');
  set('CONNECTOR_HTTP_ALLOW_PRIVATE_NETWORKS', 'false');
  set('CONNECTOR_HTTP_TIMEOUT_SECONDS', '30');
  set('CONNECTOR_HTTP_MAX_RESPONSE_BYTES', '1048576');
  set('CONNECTOR_DATABASE_ALLOWED_HOSTS', '');
  set('CONNECTOR_DATABASE_ALLOWED_PORTS', '5432');
  set('CONNECTOR_DATABASE_ALLOW_PRIVATE_NETWORKS', 'false');
  set('CONNECTOR_FAILURE_THRESHOLD', '5');
  set('CONNECTOR_CIRCUIT_COOLDOWN_SECONDS', '300');
  Object.assign(process.env, {
    STORAGE_ENDPOINT: 'https://storage.example.test',
    STORAGE_ALLOW_INSECURE: 'false',
    STORAGE_REGION: 'us-east-1',
    STORAGE_BUCKET: 'unit-test-bucket',
  });
  set('STORAGE_ACCESS_KEY', 'unit-test-access-key');
  set('STORAGE_SECRET_KEY', 'unit-test-secret-key-min-32-chars-long');
  set('STORAGE_FORCE_PATH_STYLE', 'true');
  set('STORAGE_PRESIGN_SECONDS', '900');
  set('STORAGE_MAX_FILE_BYTES', '1048576');
  set('STORAGE_CLEANUP_INTERVAL_SECONDS', '3600');
  set('STORAGE_CLEANUP_BATCH_SIZE', '100');
  set('RETENTION_WORKER_INTERVAL_SECONDS', '3600');
  set('RETENTION_ENVIRONMENT_BATCH_SIZE', '10');
  set('RETENTION_EVENT_BATCH_SIZE', '100');
  set('CONTROL_PAYLOAD_KEY_VERSION', 'v1');
  set('CONTROL_PAYLOAD_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  set('CONTROL_OUTBOX_POLL_INTERVAL_SECONDS', '2');
  set('CONTROL_OUTBOX_BATCH_SIZE', '50');
  set('CONTROL_OUTBOX_CLAIM_TIMEOUT_SECONDS', '60');
  set('CONTROL_OUTBOX_MAX_ATTEMPTS', '10');
  set('CONTROL_OUTBOX_RETRY_BASE_SECONDS', '2');
  set('CONTROL_OUTBOX_RETRY_MAX_SECONDS', '300');
  set('OBSERVABILITY_METRICS_TOKEN', `${secret}${secret}`.slice(0, 64));
  set('CONFIGURATION_RUNTIME_ENVIRONMENT_KEY', 'configuration-local-development-v1');
}

ensurePlaygroundUnitRuntimeEnv();
