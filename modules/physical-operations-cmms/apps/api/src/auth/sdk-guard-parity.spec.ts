/**
 * WI-OI-085a — the module SDK's SignedContextGuardBase, configured as CMMS, decides every case exactly like the
 * certified CmmsAuthorizationGuard and derives the same principal. This is the evidence that new modules get the
 * certified behaviour; CMMS itself keeps its own guard until it adopts the SDK in a separate change.
 */
import 'reflect-metadata';
import { generateKeyPairSync } from 'node:crypto';
import { type PlatformContextV1, signPlatformContextToken } from '@gigalibs/auth-core';
import { RequirePermissions, SignedContextGuardBase } from '@gigalibs/module-sdk';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { DatabaseService } from '../database/database.service.js';
import type { CmmsRuntimeConfig } from '../runtime-config.js';
import { CmmsAuthorizationGuard } from './authorization.js';

const pem = { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } } as const;
const signer = generateKeyPairSync('ed25519', pem);
const stranger = generateKeyPairSync('ed25519', pem);

function claims(overrides: Partial<PlatformContextV1> = {}): PlatformContextV1 {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'gigalibs-control-plane',
    aud: 'gigalibs-cmms-api',
    sub: 'cmuser0000000000000000001',
    tenant_id: 'cmtenant00000000000000001',
    session_id: 'session-1',
    auth_version: 3,
    roles: ['TENANT_ADMIN'],
    granted_scopes: ['cmms.assets.read'],
    persona_type: 'TENANT_ADMIN',
    org_scope: { mode: 'SCOPED_DEPARTMENTS', department_ids: ['7b1d8f3e-2c4a-4e6b-9f1a-3c5d7e9f1a2b'] },
    spatial_scope: { mode: 'SCOPED_PLACES', place_ids: ['5b9f7c1e-4d2a-4e8b-9c3f-1a2b3c4d5e6f'] },
    entitlement: { module_key: 'asset-maintenance', status: 'ENABLED', version: 'v1' },
    iat: now,
    exp: now + 60,
    jti: 'jti-1',
    ...overrides,
  } as PlatformContextV1;
}
const bearer = (overrides: Partial<PlatformContextV1> = {}, key = signer.privateKey) =>
  `Bearer ${signPlatformContextToken(claims(overrides), key)}`;

const REQUIRED = ['cmms.assets.read'];
function handler() {}
RequirePermissions(...REQUIRED)({}, 'handler', { value: handler });

type Outcome = { admitted: true; principal: unknown } | { admitted: false; error: string; status: number };

async function decide(
  guardFor: (database: DatabaseService) => { canActivate(context: ExecutionContext): Promise<boolean> },
  principalKey: string,
  authorization: string | undefined,
  revoked: boolean | Error,
): Promise<Outcome> {
  const database = {
    isContextRevoked: async () => {
      if (revoked instanceof Error) throw revoked;
      return revoked;
    },
  } as unknown as DatabaseService;
  const request: Record<string, any> = { headers: authorization === undefined ? {} : { authorization } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  try {
    await guardFor(database).canActivate(context);
    return { admitted: true, principal: request[principalKey] };
  } catch (error) {
    const typed = error as { constructor: { name: string }; getStatus?: () => number };
    return { admitted: false, error: typed.constructor.name, status: typed.getStatus?.() ?? 0 };
  }
}

const cmms = (database: DatabaseService) =>
  new CmmsAuthorizationGuard(
    { platformContextPublicKey: signer.publicKey, platformContextAudience: 'gigalibs-cmms-api' } as CmmsRuntimeConfig,
    { getAllAndOverride: () => REQUIRED } as unknown as Reflector,
    database,
  );
const sdk = (database: DatabaseService) =>
  new SignedContextGuardBase(
    {
      label: 'CMMS',
      moduleKey: 'asset-maintenance',
      entitlementName: 'Asset & Maintenance',
      permissionPrefix: 'cmms',
      publicKey: signer.publicKey,
      audience: 'gigalibs-cmms-api',
    },
    database,
  );

const cases: [string, string | undefined, (boolean | Error)?][] = [
  ['valid context with scoped departments and places', bearer()],
  ['flat tenant, unbounded places', bearer({ org_scope: { mode: 'FLAT_TENANT' }, spatial_scope: undefined })],
  ['module wildcard', bearer({ granted_scopes: ['cmms:*'] })],
  ['global wildcard', bearer({ granted_scopes: ['*'] })],
  ['missing permission', bearer({ granted_scopes: ['cmms.assets.write'] })],
  ['another module entitlement', bearer({ entitlement: { module_key: 'gigaops', status: 'ENABLED', version: 'v1' } })],
  ['invalid tenant identifier', bearer({ tenant_id: '-bad tenant' })],
  ['another audience', bearer({ aud: 'gigalibs-workforce-api' })],
  ['another signing key', bearer({}, stranger.privateKey)],
  ['expired', bearer({ iat: 1, exp: 2 })],
  ['no header', undefined],
  ['another scheme', bearer().replace('Bearer', 'Basic')],
  ['revoked session', bearer(), true],
  ['revocation store down', bearer(), new Error('down')],
];

describe('SDK signed-context guard parity with the certified CMMS guard', () => {
  it.each(cases)('%s', async (_label, authorization, revoked = false) => {
    const expected = await decide(cmms, 'cmmsPrincipal', authorization, revoked);
    const actual = await decide(sdk, 'modulePrincipal', authorization, revoked);
    expect(actual).toEqual(expected);
  });
});
