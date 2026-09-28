import { generateKeyPairSync, sign as signBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PlatformContextV1 } from '@gigalibs/contracts';
import {
  PlatformContextError,
  signPlatformContextToken,
  verifyPlatformContextToken,
} from './platform-context.js';

const { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const AUDIENCE = 'gigalibs-cmms-api';

function createValidPayload(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: AUDIENCE,
    sub: '00000000-0000-0000-0000-000000000002',
    tenant_id: '00000000-0000-0000-0000-000000000001',
    session_id: '00000000-0000-0000-0000-000000000003',
    auth_version: 1,
    roles: ['TENANT_ADMIN'],
    granted_scopes: ['cmms:read', 'cmms:write'],
    persona_type: 'TENANT_ADMIN',
    org_scope: {
      mode: 'FLAT_TENANT',
    },
    entitlement: {
      module_key: 'asset-maintenance',
      status: 'ENABLED',
      version: 'v1',
    },
    iat: now,
    exp: now + 300,
    jti: '00000000-0000-0000-0000-000000000004',
    ...overrides,
  };
}

describe('platform-context token lifecycle', () => {
  it('signs and verifies a valid FLAT_TENANT payload', () => {
    const payload = createValidPayload();
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = verifyPlatformContextToken(token, PUBLIC_KEY, AUDIENCE);
    expect(verified.tenant_id).toBe(payload.tenant_id);
    expect(verified.sub).toBe(payload.sub);
    expect(verified.org_scope.mode).toBe('FLAT_TENANT');
    expect(verified.granted_scopes).toContain('cmms:read');
  });

  it('signs and verifies a SCOPED_DEPARTMENTS payload', () => {
    const payload = createValidPayload({
      org_scope: {
        mode: 'SCOPED_DEPARTMENTS',
        department_ids: ['11111111-1111-1111-1111-111111111111'],
      },
      persona_type: 'WORKFORCE_MEMBER',
    });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const verified = verifyPlatformContextToken(token, PUBLIC_KEY, AUDIENCE);

    expect(verified.org_scope.mode).toBe('SCOPED_DEPARTMENTS');
    if (verified.org_scope.mode === 'SCOPED_DEPARTMENTS') {
      expect(verified.org_scope.department_ids).toEqual(['11111111-1111-1111-1111-111111111111']);
    }
  });

  it('rejects missing or non-Ed25519 signing and verification keys', () => {
    const payload = createValidPayload();
    expect(() => signPlatformContextToken(payload, 'not-a-private-key')).toThrowError(
      PlatformContextError,
    );
    const validToken = signPlatformContextToken(payload, PRIVATE_KEY);
    expect(() => verifyPlatformContextToken(validToken, 'not-a-public-key', AUDIENCE)).toThrowError(
      PlatformContextError,
    );
  });

  it('rejects tampered token signature', () => {
    const payload = createValidPayload();
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.badsignature`;

    expect(() => verifyPlatformContextToken(tampered, PUBLIC_KEY, AUDIENCE)).toThrow(
      'Token signature verification failed.',
    );
  });

  it('rejects tampered token payload', () => {
    const payload = createValidPayload();
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    const parts = token.split('.');
    const modifiedPayload = Buffer.from(
      JSON.stringify({ ...payload, tenant_id: '00000000-0000-0000-0000-999999999999' }),
    ).toString('base64url');
    const tampered = `${parts[0]}.${modifiedPayload}.${parts[2]}`;

    expect(() => verifyPlatformContextToken(tampered, PUBLIC_KEY, AUDIENCE)).toThrow(
      'Token signature verification failed.',
    );
  });

  it('rejects token with invalid issuer', () => {
    const payload = { ...createValidPayload(), iss: 'untrusted-issuer' };
    const header = { alg: 'EdDSA', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = `${encodedHeader}.${encodedPayload}`;
    const sig = signBytes(null, Buffer.from(data), PRIVATE_KEY).toString('base64url');
    const token = `${data}.${sig}`;

    expect(() => verifyPlatformContextToken(token, PUBLIC_KEY, AUDIENCE)).toThrowError(
      PlatformContextError,
    );
  });

  it('rejects wrong audience', () => {
    const payload = createValidPayload();
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    expect(() => verifyPlatformContextToken(token, PUBLIC_KEY, 'wrong-service-aud')).toThrow(
      "Invalid token audience: 'gigalibs-cmms-api'. Expected 'wrong-service-aud'.",
    );
  });

  it('rejects expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = createValidPayload({
      iat: now - 600,
      exp: now - 10,
    });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    expect(() => verifyPlatformContextToken(token, PUBLIC_KEY, AUDIENCE)).toThrow(
      'Platform context token has expired.',
    );
  });

  it('rejects token issued in future', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = createValidPayload({
      iat: now + 120,
      exp: now + 720,
    });
    const token = signPlatformContextToken(payload, PRIVATE_KEY);
    expect(() => verifyPlatformContextToken(token, PUBLIC_KEY, AUDIENCE)).toThrow(
      'Platform context token issued in the future.',
    );
  });
});
