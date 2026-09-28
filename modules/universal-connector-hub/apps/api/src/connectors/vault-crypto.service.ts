import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { loadConnectorHubRuntimeConfig } from '../runtime-config.js';

export interface EncryptedSecret {
  encryptedData: string;
  iv: string;
  authTag: string;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

@Injectable()
export class VaultCryptoService {
  private readonly logger = new Logger(VaultCryptoService.name);
  private readonly encryptionKey: Buffer;

  constructor() {
    const rawKey = loadConnectorHubRuntimeConfig().vaultKey;
    // Derive a fixed 32-byte (256-bit) key using SHA-256
    this.encryptionKey = createHash('sha256').update(rawKey).digest();
  }

  /**
   * Encrypt plain text using AES-256-GCM with a fresh 12-byte IV and authentication tag.
   */
  encrypt(plainText: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  /**
   * Decrypt AES-256-GCM encrypted ciphertext with authentication tag verification.
   */
  decrypt(encrypted: EncryptedSecret): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(encrypted.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generate RFC 7636 PKCE code_verifier and code_challenge (S256).
   */
  generatePkcePair(): PkcePair {
    const codeVerifier = randomBytes(32)
      .toString('base64url')
      .replace(/[^a-zA-Z0-9-._~]/g, '');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Validate PKCE challenge matching.
   */
  verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
    const computed = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    if (computed.length !== codeChallenge.length) return false;
    return timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
  }

  /**
   * Compute HMAC-SHA256 signature for webhook validation.
   */
  computeHmacSha256(secret: string, data: string | Buffer): string {
    const { createHmac } = require('node:crypto');
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Constant-time comparison between signature strings.
   */
  verifyTimingSafe(expected: string, actual: string): boolean {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(actual, 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }
}
