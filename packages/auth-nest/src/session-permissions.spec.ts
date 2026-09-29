import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  session: { findFirst: vi.fn() },
  tenantMember: { findUnique: vi.fn() },
  mfaRecoveryCode: { count: vi.fn() },
  platformRoleAssignment: { findMany: vi.fn() },
}));

vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

import { AuthService } from './auth.service.js';

const tenantId = 'tenant-one';

function activeSession() {
  return {
    id: 'session-1',
    userId: 'user-1',
    tenantId,
    createdAt: new Date('2026-09-26T00:00:00.000Z'),
    expiresAt: new Date(Date.now() + 3_600_000),
    mfaVerifiedAt: null,
    user: { id: 'user-1', email: 'admin@example.test', name: 'Admin', status: 'ACTIVE', totpCredential: null },
    tenant: {
      id: tenantId,
      slug: 'tenant-one',
      name: 'Tenant One',
      status: 'ACTIVE',
      region: 'local',
      plan: 'TRIAL',
      trialEndsAt: null,
      features: ['gigaops'],
      moduleEntitlements: [{ moduleKey: 'gigaops', status: 'ENABLED', updatedAt: new Date() }],
      settings: { security: { enforceMfa: false } },
    },
  };
}

function membership(role: string) {
  return { role, status: 'ACTIVE', permissions: ['*'], departmentId: null, customRole: null };
}

// Builds the session permission set through the same code path a real login uses: base role
// resolution plus the tenant-permission filter. Hand-picked scopes hid the WI-OI-061 access gap.
describe('session permissions for Workforce access', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'x'.repeat(48));
    vi.stubEnv('JWT_ACCESS_EXPIRES_IN', '15m');
    vi.stubEnv('JWT_REFRESH_EXPIRES_IN', '30d');
    vi.stubEnv('CONTROL_PAYLOAD_KEY_VERSION', 'v1');
    vi.stubEnv('CONTROL_PAYLOAD_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    prismaMock.session.findFirst.mockResolvedValue(activeSession());
    prismaMock.platformRoleAssignment.findMany.mockResolvedValue([]);
    prismaMock.mfaRecoveryCode.count.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('gives a tenant administrator the workforce wildcard without trusting a direct "*" grant', async () => {
    prismaMock.tenantMember.findUnique.mockResolvedValue(membership('TENANT_ADMIN'));
    const context = await new AuthService().getSessionContext('user-1', 'session-1', tenantId);
    expect(context.permissions).toContain('workforce:*');
    expect(context.permissions).toContain('maps:*');
    expect(context.permissions).toContain('cmms:*');
    expect(context.permissions).not.toContain('*');
    expect(context.tenant?.entitlements).toEqual([
      expect.objectContaining({ moduleKey: 'gigaops', status: 'ENABLED' }),
    ]);
  });

  it.each(['MANAGER', 'MEMBER', 'VIEWER'])('gives %s no Workforce authority', async (role) => {
    prismaMock.tenantMember.findUnique.mockResolvedValue(membership(role));
    const context = await new AuthService().getSessionContext('user-1', 'session-1', tenantId);
    expect(context.permissions.some((permission) => permission.startsWith('workforce'))).toBe(false);
    expect(context.permissions.some((permission) => permission.startsWith('cmms'))).toBe(false);
  });

  // WI-OI-103e (ADR-0016 F16): module permissions such as analytics:charts:write reach the session through a custom
  // role or a direct grant; platform codes and misplaced wildcards still do not.
  it('keeps three-part module permissions from a custom role and direct grants, and drops invalid codes', async () => {
    prismaMock.tenantMember.findUnique.mockResolvedValue({
      ...membership('MEMBER'),
      permissions: ['analytics:export', 'analytics:charts:*', 'platform:tenants:write'],
      customRole: { permissions: ['analytics:charts:write', 'analytics:models:publish', 'platform:admin', 'Analytics:read'] },
    });
    const context = await new AuthService().getSessionContext('user-1', 'session-1', tenantId);
    expect(context.permissions).toEqual(
      expect.arrayContaining(['analytics:charts:write', 'analytics:models:publish', 'analytics:export']),
    );
    for (const refused of ['analytics:charts:*', 'platform:tenants:write', 'platform:admin', 'Analytics:read']) {
      expect(context.permissions).not.toContain(refused);
    }
  });
});

describe('session spatial scope', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'x'.repeat(48));
    vi.stubEnv('JWT_ACCESS_EXPIRES_IN', '15m');
    vi.stubEnv('JWT_REFRESH_EXPIRES_IN', '30d');
    vi.stubEnv('CONTROL_PAYLOAD_KEY_VERSION', 'v1');
    vi.stubEnv('CONTROL_PAYLOAD_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    prismaMock.platformRoleAssignment.findMany.mockResolvedValue([]);
    prismaMock.mfaRecoveryCode.count.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function scopedTenantSession(features: string[]) {
    const session = activeSession();
    return { ...session, tenant: { ...session.tenant, features } };
  }

  const bengaluru = '5b9f7c1e-4d2a-4e8b-9c3f-1a2b3c4d5e6f';
  const emea = '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

  async function scopeFor(role: string, spatialScopePlaceIds: string[], features = ['gigaops', 'spatial-scoping']) {
    prismaMock.session.findFirst.mockResolvedValue(scopedTenantSession(features));
    prismaMock.tenantMember.findUnique.mockResolvedValue({ ...membership(role), spatialScopePlaceIds });
    return (await new AuthService().getSessionContext('user-1', 'session-1', tenantId)).spatialScope;
  }

  it('stays unbounded until the tenant opts in, whatever places are stored', async () => {
    await expect(scopeFor('MEMBER', [bengaluru], ['gigaops'])).resolves.toEqual({ mode: 'UNBOUNDED' });
  });

  it('limits an opted-in member to the assigned places', async () => {
    await expect(scopeFor('MEMBER', [bengaluru, emea])).resolves.toEqual({
      mode: 'SCOPED_PLACES',
      placeIds: [bengaluru, emea],
    });
  });

  it('fails closed for an opted-in member with no assigned places', async () => {
    await expect(scopeFor('VIEWER', [])).resolves.toEqual({ mode: 'SCOPED_PLACES', placeIds: [] });
  });

  it.each(['TENANT_ADMIN', 'SUPER_ADMIN'])('keeps %s unbounded in an opted-in tenant', async (role) => {
    await expect(scopeFor(role, [bengaluru])).resolves.toEqual({ mode: 'UNBOUNDED' });
  });

  it('keeps platform roles unbounded in an opted-in tenant', async () => {
    prismaMock.platformRoleAssignment.findMany.mockResolvedValue([{ role: 'PLATFORM_ADMIN' }]);
    await expect(scopeFor('MEMBER', [bengaluru])).resolves.toEqual({ mode: 'UNBOUNDED' });
  });
});
