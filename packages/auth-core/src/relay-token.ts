import { createHash, createPrivateKey, createPublicKey, randomUUID, sign as signBytes, verify as verifyBytes } from 'node:crypto';

/**
 * Module-to-module relay token (ADR-0007 option A). A producing module's outbox relay signs one short-lived
 * token per delivered message with the consumer's relay key. It is distinct from a user PlatformContextV1:
 * header `typ: relay+jwt`, issuer `gigalibs-module-relay`, no user scopes. It is bound to one tenant, one
 * message id and the SHA-256 of the exact request body, so it cannot be replayed for other content.
 */
export interface RelayTokenClaims {
  readonly iss: 'gigalibs-module-relay';
  /** Consumer inbox audience, e.g. `gigalibs-workforce-inbox`. */
  readonly aud: string;
  /** Producing module, e.g. `cmms`. */
  readonly sub: string;
  readonly tenant_id: string;
  readonly message_id: string;
  readonly body_sha256: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

export class RelayTokenError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'RelayTokenError';
  }
}

const RELAY_ISSUER = 'gigalibs-module-relay';
const RELAY_TYPE = 'relay+jwt';
const MAX_LIFETIME_SECONDS = 120;

export function relayBodyDigest(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export function signRelayToken(
  input: { readonly audience: string; readonly source: string; readonly tenantId: string; readonly messageId: string; readonly body: string },
  privateKeyPem: string,
  lifetimeSeconds = 60,
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: RelayTokenClaims = {
    iss: RELAY_ISSUER,
    aud: input.audience,
    sub: input.source,
    tenant_id: input.tenantId,
    message_id: input.messageId,
    body_sha256: relayBodyDigest(input.body),
    iat: now,
    exp: now + Math.min(Math.max(lifetimeSeconds, 1), MAX_LIFETIME_SECONDS),
    jti: randomUUID(),
  };
  const data = `${encode({ alg: 'EdDSA', typ: RELAY_TYPE })}.${encode(claims)}`;
  const signature = signBytes(null, Buffer.from(data), privateKey(privateKeyPem)).toString('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies signature, header type, issuer, audience, expected source, lifetime, and that the token was issued
 * for exactly this request body.
 */
export function verifyRelayToken(
  token: string,
  publicKeyPem: string,
  expected: { readonly audience: string; readonly source: string; readonly body: string },
): RelayTokenClaims {
  const parts = typeof token === 'string' ? token.trim().split('.') : [];
  if (parts.length !== 3 || parts.some((part) => !part)) throw new RelayTokenError('Relay token is malformed.', 'INVALID_FORMAT');
  const [encodedHeader, encodedClaims, signature] = parts as [string, string, string];
  if (!verifyBytes(null, Buffer.from(`${encodedHeader}.${encodedClaims}`), publicKey(publicKeyPem), Buffer.from(signature, 'base64url'))) {
    throw new RelayTokenError('Relay token signature verification failed.', 'INVALID_SIGNATURE');
  }
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
  } catch {
    throw new RelayTokenError('Relay token contains unparseable JSON.', 'MALFORMED_JSON');
  }
  if (header.alg !== 'EdDSA' || header.typ !== RELAY_TYPE) throw new RelayTokenError('Not a relay token.', 'INVALID_HEADER');
  const now = Math.floor(Date.now() / 1000);
  const required = ['aud', 'sub', 'tenant_id', 'message_id', 'body_sha256', 'jti'] as const;
  if (claims.iss !== RELAY_ISSUER || required.some((key) => typeof claims[key] !== 'string' || !claims[key])) {
    throw new RelayTokenError('Relay token claims are invalid.', 'INVALID_CLAIMS');
  }
  if (typeof claims.iat !== 'number' || typeof claims.exp !== 'number') throw new RelayTokenError('Relay token times are invalid.', 'INVALID_CLAIMS');
  if (claims.aud !== expected.audience) throw new RelayTokenError('Relay token audience is wrong.', 'WRONG_AUDIENCE');
  if (claims.sub !== expected.source) throw new RelayTokenError('Relay token source is wrong.', 'WRONG_SOURCE');
  if (claims.exp <= now) throw new RelayTokenError('Relay token has expired.', 'EXPIRED_TOKEN');
  if (claims.iat > now + 5 || claims.exp - claims.iat > MAX_LIFETIME_SECONDS) throw new RelayTokenError('Relay token lifetime is invalid.', 'INVALID_LIFETIME');
  if (claims.body_sha256 !== relayBodyDigest(expected.body)) throw new RelayTokenError('Relay token was issued for different content.', 'BODY_MISMATCH');
  return claims as unknown as RelayTokenClaims;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function privateKey(pem: string) {
  try {
    const key = createPrivateKey(pem.trim().replaceAll('\\n', '\n'));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new RelayTokenError('The relay signing key must be an Ed25519 private key.', 'INVALID_PRIVATE_KEY');
  }
}

function publicKey(pem: string) {
  try {
    const key = createPublicKey(pem.trim().replaceAll('\\n', '\n'));
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new RelayTokenError('The relay verification key must be an Ed25519 public key.', 'INVALID_PUBLIC_KEY');
  }
}
