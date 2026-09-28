import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { signPlatformContextToken, verifyPlatformContextToken } from '../packages/auth-core/dist/index.js';

const root = new URL('../', import.meta.url).pathname;
const violations = [];

function checkFile(relPath, desc) {
  const fullPath = join(root, relPath);
  if (!existsSync(fullPath)) {
    violations.push({ code: 'FILE_MISSING', message: `${desc} at ${relPath} is missing.` });
    return '';
  }
  return readFileSync(fullPath, 'utf8');
}

// 1. Verify Ed25519 key generation & cryptographic contract
let privateKeyPem;
let publicKeyPem;
try {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  privateKeyPem = privateKey;
  publicKeyPem = publicKey;

  if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) {
    violations.push({ code: 'INVALID_PRIVATE_KEY', message: 'Ed25519 private key must be PKCS#8 format.' });
  }
  if (!publicKeyPem.includes('BEGIN PUBLIC KEY')) {
    violations.push({ code: 'INVALID_PUBLIC_KEY', message: 'Ed25519 public key must be SPKI format.' });
  }

  const now = Math.floor(Date.now() / 1000);
  const dummyPayload = {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-cmms-api',
    sub: 'usr-test-001',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    session_id: 'sess-test-001',
    auth_version: 1,
    roles: ['OPERATIONS_SUPERVISOR'],
    persona_type: 'OPERATIONS_SUPERVISOR',
    org_scope: { mode: 'FLAT_TENANT' },
    granted_scopes: ['workforce:read', 'workforce:write'],
    entitlement: {
      module_key: 'asset-maintenance',
      status: 'ENABLED',
      version: new Date().toISOString(),
    },
    iat: now,
    exp: now + 300,
    jti: '00000000-0000-0000-0000-000000000001',
  };

  const signed = signPlatformContextToken(dummyPayload, privateKeyPem);

  const verified = verifyPlatformContextToken(signed, publicKeyPem, 'gigalibs-cmms-api');
  if (verified.tenant_id !== dummyPayload.tenant_id || verified.sub !== dummyPayload.sub) {
    violations.push({ code: 'TOKEN_VERIFICATION_MISMATCH', message: 'Signed token claims did not match original payload.' });
  }
} catch (err) {
  violations.push({ code: 'CRYPTO_ERROR', message: `Cryptographic key generation/verification failed: ${err.message}` });
}

// 2. Verify Helm charts for Managed Cloud deployment profile
const helmWeb = checkFile('infra/helm/workflow-platform/templates/web.yaml', 'Helm web template');
if (!helmWeb.includes('PLATFORM_CONTEXT_PRIVATE_KEY')) {
  violations.push({ code: 'HELM_WEB_SECRET_MISSING', message: 'Helm web template does not reference PLATFORM_CONTEXT_PRIVATE_KEY.' });
}

const helmApi = checkFile('infra/helm/workflow-platform/templates/api.yaml', 'Helm API template');
if (!helmApi.includes('PLATFORM_CONTEXT_PUBLIC_KEY')) {
  violations.push({ code: 'HELM_API_SECRET_MISSING', message: 'Helm API template does not reference PLATFORM_CONTEXT_PUBLIC_KEY.' });
}

// 3. Verify Docker Compose for Customer-Managed profile
const composeFile = checkFile('infra/compose/compose.yaml', 'Docker Compose definition');
if (!composeFile.includes('PLATFORM_CONTEXT_PRIVATE_KEY')) {
  violations.push({ code: 'COMPOSE_PRIVATE_KEY_MISSING', message: 'Docker Compose does not mount PLATFORM_CONTEXT_PRIVATE_KEY.' });
}
if (!composeFile.includes('PLATFORM_CONTEXT_PUBLIC_KEY')) {
  violations.push({ code: 'COMPOSE_PUBLIC_KEY_MISSING', message: 'Docker Compose does not mount PLATFORM_CONTEXT_PUBLIC_KEY.' });
}

const envExample = checkFile('infra/compose/.env.example', 'Docker Compose env example');
if (!envExample.includes('PLATFORM_CONTEXT_PRIVATE_KEY')) {
  violations.push({ code: 'ENV_EXAMPLE_PRIVATE_KEY_MISSING', message: '.env.example lacks PLATFORM_CONTEXT_PRIVATE_KEY declaration.' });
}
if (!envExample.includes('PLATFORM_CONTEXT_PUBLIC_KEY')) {
  violations.push({ code: 'ENV_EXAMPLE_PUBLIC_KEY_MISSING', message: '.env.example lacks PLATFORM_CONTEXT_PUBLIC_KEY declaration.' });
}

// 4. Output validation result
if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'failed', violations }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      algorithm: 'Ed25519',
      profilesValidated: ['managed-cloud-helm', 'customer-managed-compose'],
      secretsValidated: ['PLATFORM_CONTEXT_PRIVATE_KEY', 'PLATFORM_CONTEXT_PUBLIC_KEY'],
    },
    null,
    2,
  ),
);
