import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TokenPayload } from './types.js';

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export function signJwt(payload: TokenPayload, secret: string, expiresInSeconds: number): string {
  if (secret.length < 32) throw new Error('JWT signing secret must contain at least 32 characters.');
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('JWT expiry must be a positive integer number of seconds.');
  }

  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(data).digest('base64url');

  return `${data}.${signature}`;
}

export function verifyJwt(token: string, secret: string): TokenPayload | null {
  if (secret.length < 32) throw new Error('JWT verification secret must contain at least 32 characters.');

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const data = `${encodedHeader}.${encodedPayload}`;
  const signatureBytes = Buffer.from(signature, 'base64url');
  const expectedBytes = createHmac('sha256', secret).update(data).digest();
  if (
    signatureBytes.length !== expectedBytes.length ||
    !timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as Record<string, unknown>;
    if (header['alg'] !== 'HS256' || header['typ'] !== 'JWT') return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as TokenPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => typeof role === 'string')
    ) {
      return null;
    }
    if (payload.exp !== undefined && (!Number.isSafeInteger(payload.exp) || payload.exp <= now)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}
