import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

export interface TenantExportSigningConfig {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyBase64: string;
}

export function getTenantExportSigningConfig(): TenantExportSigningConfig | undefined {
  const encoded = process.env.TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64?.trim();
  const keyId = process.env.TENANT_EXPORT_SIGNING_KEY_ID?.trim();
  if (!encoded && !keyId) return undefined;
  if (!encoded || !keyId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(keyId)) {
    throw new Error('Tenant export signing requires a valid private key and key identifier.');
  }
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({
      key: Buffer.from(encoded, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    throw new Error('TENANT_EXPORT_SIGNING_PRIVATE_KEY_BASE64 is not a valid PKCS8 key.');
  }
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Tenant export signing key must use Ed25519.');
  }
  const publicKey = createPublicKey(privateKey);
  return {
    keyId,
    privateKey,
    publicKey,
    publicKeyBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}

export function requireTenantExportSigningConfig(): TenantExportSigningConfig {
  const configured = getTenantExportSigningConfig();
  if (!configured) {
    throw new ServiceUnavailableException({
      code: 'TENANT_EXPORT_SIGNING_UNAVAILABLE',
      message: 'Tenant data export is unavailable because archive signing is not configured.',
    });
  }
  return configured;
}

export function tenantExportPolicy() {
  return Object.freeze({
    pollIntervalSeconds: optionalPositiveInteger('TENANT_EXPORT_POLL_INTERVAL_SECONDS', 10),
    batchSize: optionalPositiveInteger('TENANT_EXPORT_BATCH_SIZE', 2),
    claimTimeoutSeconds: optionalPositiveInteger('TENANT_EXPORT_CLAIM_TIMEOUT_SECONDS', 300),
    maxAttempts: optionalPositiveInteger('TENANT_EXPORT_MAX_ATTEMPTS', 5),
    retryBaseSeconds: optionalPositiveInteger('TENANT_EXPORT_RETRY_BASE_SECONDS', 10),
    retryMaxSeconds: optionalPositiveInteger('TENANT_EXPORT_RETRY_MAX_SECONDS', 900),
    expiryHours: optionalPositiveInteger('TENANT_EXPORT_EXPIRY_HOURS', 168),
  });
}

function optionalPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
