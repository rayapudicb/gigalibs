import { signJwt, verifyJwt } from '@gigalibs/auth-core';
import { describe, expect, it } from 'vitest';
import { MOBILE_ACCESS_TOKEN_SECONDS, MobileKeys, appVersionAtLeast, parseAppVersion, refreshLifetimeSeconds } from './mobile-credentials.js';

// WI-OI-120cf: a mobile access token is the mobile audience's only, bound to its installation and binding; the
// opaque values the BFF hands out cannot be read, changed or used for another purpose.

const ROOT = 'r'.repeat(48);
const bound = { sub: 'user-1', sid: 'session-1', tid: 'tenant-1', ins: '0199d6f4-3af2-7b4e-8eb2-4e58b2be4a01', prf: 'gigalibs-universal', bnd: 'TENANT_BOUND' } as const;

describe('mobile access tokens', () => {
  it('signs a short token that verifies with its claims and expiry', () => {
    const keys = new MobileKeys(ROOT);
    const { token, expiresAt } = keys.signAccess(bound);
    const claims = keys.verifyAccess(token);
    expect(claims).toMatchObject(bound);
    const seconds = (expiresAt.getTime() - Date.now()) / 1_000;
    expect(seconds).toBeGreaterThan(MOBILE_ACCESS_TOKEN_SECONDS - 5);
    expect(seconds).toBeLessThanOrEqual(MOBILE_ACCESS_TOKEN_SECONDS);
  });

  it('is refused by the web verifier, and a web token is refused here', () => {
    const keys = new MobileKeys(ROOT);
    expect(verifyJwt(keys.signAccess(bound).token, ROOT)).toBeNull();
    const web = signJwt({ sub: 'user-1', sid: 'session-1', tid: 'tenant-1', roles: [] }, ROOT, 600);
    expect(keys.verifyAccess(web)).toBeNull();
  });

  it('is refused when signed under another deployment secret or changed', () => {
    const token = new MobileKeys(ROOT).signAccess(bound).token;
    expect(new MobileKeys('s'.repeat(48)).verifyAccess(token)).toBeNull();
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()), tid: 'tenant-2' })).toString('base64url');
    expect(new MobileKeys(ROOT).verifyAccess(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('keeps the binding and the tenant consistent', () => {
    const keys = new MobileKeys(ROOT);
    const preTenant = keys.signAccess({ sub: 'user-1', sid: 'session-1', ins: bound.ins, prf: bound.prf, bnd: 'PRE_TENANT' });
    expect(keys.verifyAccess(preTenant.token)).toMatchObject({ bnd: 'PRE_TENANT' });
    expect(keys.verifyAccess(preTenant.token)?.tid).toBeUndefined();
    const mixed = keys.signAccess({ ...bound, bnd: 'PRE_TENANT' } as never);
    expect(keys.verifyAccess(mixed.token)).toBeNull();
  });

  it('refuses a root secret shorter than 32 characters', () => {
    expect(() => new MobileKeys('short')).toThrow(/32 characters/);
  });
});

describe('sealed values', () => {
  it('round-trips, and is opaque and URL-safe', () => {
    const keys = new MobileKeys(ROOT);
    const sealed = keys.seal('selection', { s: 'session-1', m: 'member-1' });
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain('member-1');
    expect(Buffer.from(sealed, 'base64url').toString('utf8')).not.toContain('member-1');
    expect(keys.open('selection', sealed)).toEqual({ s: 'session-1', m: 'member-1' });
  });

  it('is refused for another purpose, another deployment, or after a change', () => {
    const keys = new MobileKeys(ROOT);
    const sealed = keys.seal('selection', { m: 'member-1' });
    expect(keys.open('switch-outcome', sealed)).toBeNull();
    expect(new MobileKeys('s'.repeat(48)).open('selection', sealed)).toBeNull();
    const raw = Buffer.from(sealed, 'base64url');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    expect(keys.open('selection', raw.toString('base64url'))).toBeNull();
    expect(keys.open('selection', 'not-a-sealed-value')).toBeNull();
  });
});

describe('app versions and refresh lifetime', () => {
  it('compares versions numerically, a pre-release below its release (pre-releases of one version alike)', () => {
    const minimum = parseAppVersion('1.2.0');
    if (!minimum) throw new Error('unparsed');
    expect(appVersionAtLeast('1.2.0', minimum)).toBe(true);
    expect(appVersionAtLeast('1.10.0', minimum)).toBe(true);
    expect(appVersionAtLeast('2.0.0+41', minimum)).toBe(true);
    expect(appVersionAtLeast('1.1.9', minimum)).toBe(false);
    expect(appVersionAtLeast('1.2.0-beta.3', minimum)).toBe(false);
    expect(appVersionAtLeast('1.2.0-beta.3', parseAppVersion('1.2.0-beta.1') ?? minimum)).toBe(true);
    for (const unreadable of [undefined, '', '1.2', 'v1.2.0', '1.2.0.4', '1.2.x']) expect(appVersionAtLeast(unreadable, minimum)).toBe(false);
  });

  it('reads the refresh lifetime the web uses', () => {
    expect(refreshLifetimeSeconds('30d')).toBe(2_592_000);
    expect(refreshLifetimeSeconds('12h')).toBe(43_200);
    expect(() => refreshLifetimeSeconds('30 days')).toThrow(/JWT_REFRESH_EXPIRES_IN/);
  });
});
