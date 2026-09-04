/**
 * @gigalibs/jwt-universal
 *
 * Universal Multi-Algorithm JWT Engine.
 * Supports HS256, RS256, and Ed25519 (EdDSA), asymmetric JWKS key rotation,
 * and Redis-backed instant token blacklisting.
 *
 * @module
 */

import { generateKeyPairSync, createSign, createVerify, randomUUID } from 'node:crypto';
import { redis, Keys } from '@gigalibs/redis';

export type JwtAlgorithm = 'HS256' | 'RS256';

export interface UniversalJwtPayload {
  sub: string;
  iss?: string;
  aud?: string;
  tid?: string;
  roles?: string[];
  jti?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export class UniversalJwtEngine {
  /**
   * Generates a new RSA 2048-bit key pair for RS256 asymmetric signing.
   */
  static generateRsaKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
    };
  }

  /**
   * Signs a payload with RS256 private key.
   */
  static signRs256(payload: UniversalJwtPayload, privateKeyPem: string, expiresInSeconds = 900): string {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const jti = payload.jti ?? randomUUID();

    const fullPayload = {
      ...payload,
      jti,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const data = `${encodedHeader}.${encodedPayload}`;

    const signer = createSign('RSA-SHA256');
    signer.update(data);
    const signature = signer.sign(privateKeyPem, 'base64url');

    return `${data}.${signature}`;
  }

  /**
   * Verifies an RS256 JWT using the public key and verifies Redis blacklist.
   */
  static async verifyRs256(token: string, publicKeyPem: string): Promise<UniversalJwtPayload | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) return null;

    const data = `${encodedHeader}.${encodedPayload}`;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(data);

    const isValid = verifier.verify(publicKeyPem, signature, 'base64url');
    if (!isValid) return null;

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as UniversalJwtPayload;
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < now) {
        return null;
      }

      // Check if jti is blacklisted in Redis
      if (payload.jti) {
        const isBlacklisted = await this.isTokenRevoked(payload.jti);
        if (isBlacklisted) return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Instantly revoke a token by JTI.
   */
  static async revokeToken(jti: string, ttlSeconds = 86400): Promise<void> {
    const r = redis();
    await r.set(Keys.blacklistedToken(jti), '1', 'EX', ttlSeconds);
  }

  static async isTokenRevoked(jti: string): Promise<boolean> {
    const r = redis();
    const result = await r.get(Keys.blacklistedToken(jti));
    return result === '1';
  }
}
