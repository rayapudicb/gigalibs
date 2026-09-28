import {
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto';
import { type PlatformContextV1, PlatformContextV1Schema } from '@gigalibs/contracts';
export type { PlatformContextV1 };

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

export class PlatformContextError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'PlatformContextError';
  }
}

export function signPlatformContextToken(
  payload: PlatformContextV1,
  privateKeyPem: string,
): string {
  const parsed = PlatformContextV1Schema.safeParse(payload);
  if (!parsed.success) {
    throw new PlatformContextError(
      `Invalid platform context payload: ${parsed.error.message}`,
      'INVALID_PAYLOAD',
    );
  }

  const privateKey = parseEd25519PrivateKey(privateKeyPem);
  const header = { alg: 'EdDSA', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = signBytes(null, Buffer.from(data), privateKey).toString('base64url');

  return `${data}.${signature}`;
}

export function verifyPlatformContextToken(
  token: string,
  publicKeyPem: string,
  expectedAudience: string,
): PlatformContextV1 {
  if (!token || typeof token !== 'string') {
    throw new PlatformContextError(
      'Missing or malformed platform context token.',
      'MISSING_TOKEN',
    );
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new PlatformContextError('Token structure is invalid.', 'INVALID_FORMAT');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new PlatformContextError('Token parts are missing.', 'INVALID_FORMAT');
  }

  const data = `${encodedHeader}.${encodedPayload}`;
  const signatureBytes = Buffer.from(signature, 'base64url');
  const publicKey = parseEd25519PublicKey(publicKeyPem);
  if (!verifyBytes(null, Buffer.from(data), publicKey, signatureBytes)) {
    throw new PlatformContextError('Token signature verification failed.', 'INVALID_SIGNATURE');
  }

  let rawHeader: Record<string, unknown>;
  let rawPayload: Record<string, unknown>;
  try {
    rawHeader = JSON.parse(base64UrlDecode(encodedHeader));
    rawPayload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new PlatformContextError('Token contains unparseable JSON.', 'MALFORMED_JSON');
  }

  if (rawHeader['alg'] !== 'EdDSA' || rawHeader['typ'] !== 'JWT') {
    throw new PlatformContextError('Unsupported token algorithm or type.', 'INVALID_HEADER');
  }

  const parsed = PlatformContextV1Schema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new PlatformContextError(
      `Token payload validation failed: ${parsed.error.message}`,
      'INVALID_CLAIMS',
    );
  }

  const context = parsed.data;
  const now = Math.floor(Date.now() / 1000);

  if (context.iss !== 'gigalibs-control-plane') {
    throw new PlatformContextError(
      `Invalid token issuer: '${context.iss}'. Expected 'gigalibs-control-plane'.`,
      'WRONG_ISSUER',
    );
  }

  if (context.aud !== expectedAudience) {
    throw new PlatformContextError(
      `Invalid token audience: '${context.aud}'. Expected '${expectedAudience}'.`,
      'WRONG_AUDIENCE',
    );
  }

  if (context.exp <= now) {
    throw new PlatformContextError('Platform context token has expired.', 'EXPIRED_TOKEN');
  }

  if (context.iat > now + 5) {
    throw new PlatformContextError('Platform context token issued in the future.', 'FUTURE_TOKEN');
  }

  return context;
}

function normalizePem(value: string): string {
  return value.trim().replaceAll('\\n', '\n');
}

function parseEd25519PrivateKey(value: string) {
  if (!value?.trim()) {
    throw new PlatformContextError(
      'Platform context Ed25519 private key is not configured.',
      'INVALID_PRIVATE_KEY',
    );
  }
  try {
    const key = createPrivateKey(normalizePem(value));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new PlatformContextError(
      'Platform context signing key must be an Ed25519 private PEM key.',
      'INVALID_PRIVATE_KEY',
    );
  }
}

function parseEd25519PublicKey(value: string) {
  if (!value?.trim()) {
    throw new PlatformContextError(
      'Platform context Ed25519 public key is not configured.',
      'INVALID_PUBLIC_KEY',
    );
  }
  try {
    const key = createPublicKey(normalizePem(value));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new PlatformContextError(
      'Platform context verification key must be an Ed25519 public PEM key.',
      'INVALID_PUBLIC_KEY',
    );
  }
}
