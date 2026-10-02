import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { describe, expect, it } from 'vitest';
import { mintPlatformContextToken } from '../lib/platform-context';
import type { VerifiedSession } from '../lib/verified-session';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function session(organizationScope: VerifiedSession['organizationScope'], orgScope: VerifiedSession['orgScope'] = { mode: 'FLAT_TENANT' }): VerifiedSession {
  return {
    user: { id: 'user-1', email: 'member@example.invalid', name: 'Member', status: 'ACTIVE' },
    tenant: {
      id: 'tenant-1',
      name: 'Tenant',
      slug: 'tenant',
      status: 'ACTIVE',
      trialEndsAt: null,
      features: [],
      entitlements: [{ moduleKey: 'gigaops', status: 'ENABLED', version: 'v1' }],
    },
    roles: ['MEMBER'],
    platformRoles: [],
    permissions: ['workforce:read'],
    session: { id: 'session-1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
    authVersion: 1,
    orgScope,
    spatialScope: { mode: 'UNBOUNDED' },
    ...(organizationScope === undefined ? {} : { organizationScope }),
    mfa: { required: false, enrolled: false, verified: true, recoveryCodesRemaining: 0 },
  };
}

const mintAndVerify = (value: VerifiedSession) =>
  verifyPlatformContextToken(mintPlatformContextToken(value, 'gigaops', 'workforce-api', { privateKey }), publicKey, 'workforce-api');

// WI-OI-109e1 (ADR-0018 §3): the signed context carries roots and the tree version, never the expanded tree.
describe('platform context organization scope', () => {
  it('signs the granted roots and the version in force beside the legacy department field', () => {
    const claims = mintAndVerify(
      session(
        { mode: 'UNITS', tree_version: 'version-7', read_roots: ['north', 'finance'], write_roots: ['north'] },
        { mode: 'SCOPED_DEPARTMENTS', departmentIds: ['north', 'store-101'] },
      ),
    );
    expect(claims.organization).toEqual({ mode: 'UNITS', tree_version: 'version-7', read_roots: ['north', 'finance'], write_roots: ['north'] });
    expect(claims.org_scope).toEqual({ mode: 'SCOPED_DEPARTMENTS', department_ids: ['north', 'store-101'] });
  });

  it('marks tenant-wide authority and keeps an empty grant set closed', () => {
    expect(mintAndVerify(session({ mode: 'TENANT' })).organization).toEqual({ mode: 'TENANT' });
    expect(mintAndVerify(session({ mode: 'UNITS', tree_version: 'version-7', read_roots: [], write_roots: [] })).organization).toMatchObject({ read_roots: [], write_roots: [] });
  });

  it('leaves the claim out until the tenant has a tree in force', () => {
    expect(mintAndVerify(session(null)).organization).toBeUndefined();
    expect(mintAndVerify(session(undefined)).organization).toBeUndefined();
  });
});
