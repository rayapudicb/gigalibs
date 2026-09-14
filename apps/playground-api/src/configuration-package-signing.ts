import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

export function configurationPackageSigningKey() {
  const encoded = process.env.CONFIGURATION_PACKAGE_SIGNING_PRIVATE_KEY_BASE64?.trim();
  const keyId = process.env.CONFIGURATION_PACKAGE_SIGNING_KEY_ID?.trim();
  if (!encoded && !keyId) {
    throw new ServiceUnavailableException({
      code: 'CONFIGURATION_PACKAGE_SIGNING_UNAVAILABLE',
      message: 'Configuration package export is unavailable because Ed25519 signing is not configured.',
    });
  }
  if (!encoded || !keyId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(keyId)) throw new Error('Configuration package signing requires a valid private key and key identifier.');
  const privateKey = createPrivateKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'pkcs8' });
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Configuration package signing key must use Ed25519.');
  const publicKey = createPublicKey(privateKey);
  return { keyId, privateKey, publicKey, publicKeyBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64') };
}

export function trustedConfigurationPackageKey(keyId: string, suppliedPublicKeyBase64: string): KeyObject {
  let local: ReturnType<typeof configurationPackageSigningKey> | undefined;
  try { local = configurationPackageSigningKey(); } catch (error) {
    if (!(error instanceof ServiceUnavailableException)) throw error;
  }
  if (local?.keyId === keyId && local.publicKeyBase64 === suppliedPublicKeyBase64) return local.publicKey;

  const raw = process.env.CONFIGURATION_PACKAGE_TRUSTED_PUBLIC_KEYS_JSON?.trim();
  let configured: unknown;
  try {
    configured = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error('CONFIGURATION_PACKAGE_TRUSTED_PUBLIC_KEYS_JSON must be valid JSON.');
  }
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
    throw new Error('CONFIGURATION_PACKAGE_TRUSTED_PUBLIC_KEYS_JSON must be a key-id to public-key object.');
  }
  const trusted = (configured as Record<string, unknown>)[keyId];
  if (typeof trusted !== 'string' || trusted !== suppliedPublicKeyBase64) {
    throw new ServiceUnavailableException({
      code: 'CONFIGURATION_PACKAGE_SIGNER_UNTRUSTED',
      message: 'The configuration package signer is not in the trusted key registry.',
    });
  }
  const publicKey = createPublicKey({ key: Buffer.from(trusted, 'base64'), format: 'der', type: 'spki' });
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Trusted configuration package keys must use Ed25519.');
  return publicKey;
}
