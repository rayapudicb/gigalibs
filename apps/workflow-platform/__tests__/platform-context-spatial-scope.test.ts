import { generateKeyPairSync } from 'node:crypto';
import { verifyPlatformContextToken } from '@gigalibs/auth-core';
import { describe, expect, it } from 'vitest';
import { mintPlatformContextToken } from '../lib/platform-context';
import type { VerifiedSession } from '../lib/verified-session';

const BENGALURU = '5b9f7c1e-4d2a-4e8b-9c3f-1a2b3c4d5e6f';
const EMEA = '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

function session(spatialScope: VerifiedSession['spatialScope']): VerifiedSession {
  return {
    user: { id: 'user-1', email: 'member@example.invalid', name: 'Member', status: 'ACTIVE' },
    tenant: {
      id: 'tenant-1',
      name: 'Tenant',
      slug: 'tenant',
      status: 'ACTIVE',
      trialEndsAt: null,
      features: ['spatial-scoping'],
      entitlements: [{ moduleKey: 'geospatial-studio', status: 'ENABLED', version: 'v1' }],
    },
    roles: ['MEMBER'],
    platformRoles: [],
    permissions: ['maps.nodes.read'],
    session: { id: 'session-1', expiresAt: new Date(Date.now() + 60_000).toISOString() },
    authVersion: 1,
    orgScope: { mode: 'FLAT_TENANT' },
    spatialScope,
    mfa: { required: false, enrolled: false, verified: true, recoveryCodesRemaining: 0 },
  };
}

const mintAndVerify = (spatialScope: VerifiedSession['spatialScope']) =>
  verifyPlatformContextToken(
    mintPlatformContextToken(session(spatialScope), 'geospatial-studio', 'geospatial-api', { privateKey }),
    publicKey,
    'geospatial-api',
  );

// WI-OI-063b: the signed module context carries the member's spatial scope from the verified session.
describe('platform context spatial scope', () => {
  it('signs the scoped places into the module context', () => {
    expect(mintAndVerify({ mode: 'SCOPED_PLACES', placeIds: [BENGALURU, EMEA] }).spatial_scope).toEqual({
      mode: 'SCOPED_PLACES',
      place_ids: [BENGALURU, EMEA],
    });
  });

  it('keeps the fail-closed empty scope instead of widening it', () => {
    expect(mintAndVerify({ mode: 'SCOPED_PLACES', placeIds: [] }).spatial_scope).toEqual({ mode: 'SCOPED_PLACES', place_ids: [] });
  });

  it('marks unscoped members as unbounded explicitly', () => {
    expect(mintAndVerify({ mode: 'UNBOUNDED' }).spatial_scope).toEqual({ mode: 'UNBOUNDED' });
  });
});
