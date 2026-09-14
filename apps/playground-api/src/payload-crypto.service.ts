import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { runtimeConfig } from './config/runtime-config.js';
import { canonicalJson } from './operational-json.js';

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  hash: string;
  keyVersion: string;
}

export function sourceEventAuthenticatedContext(
  tenantId: string,
  eventId: string,
  eventType: string,
  eventVersion: number,
): string {
  return `${tenantId}:${eventId}:${eventType}:${eventVersion}`;
}

@Injectable()
export class PayloadCryptoService {
  encrypt(payload: Record<string, unknown>, authenticatedContext: string): EncryptedPayload {
    const plaintext = Buffer.from(canonicalJson(payload), 'utf8');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', runtimeConfig.controlPayloadEncryptionKey, iv);
    cipher.setAAD(Buffer.from(authenticatedContext, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      ciphertext,
      iv,
      authTag: cipher.getAuthTag(),
      hash: createHash('sha256').update(plaintext).digest('hex'),
      keyVersion: runtimeConfig.controlPayloadKeyVersion,
    };
  }

  decrypt(
    encrypted: {
      ciphertext: Uint8Array;
      iv: Uint8Array;
      authTag: Uint8Array;
      keyVersion: string;
    },
    authenticatedContext: string,
  ): Record<string, unknown> {
    const key = runtimeConfig.controlPayloadDecryptionKeys.get(encrypted.keyVersion);
    if (!key) throw new Error(`Payload key version '${encrypted.keyVersion}' is not loaded.`);
    const decipher = createDecipheriv('aes-256-gcm', key, encrypted.iv);
    decipher.setAAD(Buffer.from(authenticatedContext, 'utf8'));
    decipher.setAuthTag(encrypted.authTag);
    const plaintext = Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]);
    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Decrypted event payload is not a JSON object.');
    }
    return parsed as Record<string, unknown>;
  }
}
