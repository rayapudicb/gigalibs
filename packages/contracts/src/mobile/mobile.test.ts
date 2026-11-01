import { describe, expect, it } from 'vitest';
import {
  MOBILE_PROBLEMS,
  MobileMembershipPageV1Schema,
  MobileMembershipSelectionV1Schema,
  MobilePasswordAuthResultV1Schema,
  MobilePasswordSignInV1Schema,
  MobileProblemV1Schema,
  MobileSessionV3Schema,
  mobileProblem,
} from './index.js';

// WI-OI-120cf: the platform's copy of the mobile team's candidate contract accepts what their client tests send and
// expect (fixtures copied from `gigalibs_mobile/packages/mobile-api/src/client.test.ts`, 2026-10-22) and refuses
// unknown fields and versions, as theirs does.

const sessionV3 = {
  contractVersion: 'mobile-session.v3',
  sessionRevision: 2,
  authorizationRevision: 3,
  configurationRevision: 4,
  tenant: { id: 'server-tenant', displayName: 'Server Tenant' },
  user: { id: 'user-a', displayName: 'User A' },
  membershipId: 'member-a',
  persona: 'WORKFORCE_MEMBER',
  entitlements: ['asset-maintenance'],
  memberOrganizationScope: { mode: 'SCOPED_DEPARTMENTS', departmentIds: ['north'] },
  memberSpatialScope: { mode: 'UNBOUNDED' },
  assignments: [
    { assignmentId: 'technician-north', permissions: ['cmms:read'], scope: { kind: 'UNITS', treeVersion: 'tree-1', unitIds: ['north'] } },
  ],
  modules: [],
  expiresAt: '2027-01-01T00:00:00.000Z',
};

describe('mobile v1 contract (platform copy)', () => {
  it('accepts the mobile client’s session v3 fixture and refuses an extra field or another version', () => {
    expect(MobileSessionV3Schema.parse(sessionV3)).toEqual(sessionV3);
    expect(MobileSessionV3Schema.safeParse({ ...sessionV3, permissions: [] }).success).toBe(false);
    expect(MobileSessionV3Schema.safeParse({ ...sessionV3, contractVersion: 'mobile-session.v2' }).success).toBe(false);
    expect(
      MobileSessionV3Schema.safeParse({ ...sessionV3, assignments: [sessionV3.assignments[0], sessionV3.assignments[0]] }).success,
    ).toBe(false);
  });

  it('tells a token set from an MFA challenge, and a challenge never carries a token', () => {
    const tokens = {
      contractVersion: 'mobile-token-set.v2',
      binding: 'PRE_TENANT',
      accessToken: 'a',
      refreshToken: 'r',
      accessTokenExpiresAt: '2026-10-22T12:10:00.000Z',
    };
    expect(MobilePasswordAuthResultV1Schema.parse(tokens)).toEqual(tokens);
    const challenge = { contractVersion: 'mobile-mfa-challenge.v1', challengeId: 'c'.repeat(43), method: 'TOTP', expiresAt: '2026-10-22T12:05:00.000Z' };
    expect(MobilePasswordAuthResultV1Schema.parse(challenge)).toEqual(challenge);
    expect(MobilePasswordAuthResultV1Schema.safeParse({ ...challenge, accessToken: 'a' }).success).toBe(false);
  });

  it('checks the sign-in and selection requests strictly', () => {
    const signIn = { contractVersion: 'mobile-password-sign-in.v1', email: 'a@example.test', password: 'x', appProfile: 'gigalibs-universal' };
    expect(MobilePasswordSignInV1Schema.safeParse(signIn).success).toBe(true);
    expect(MobilePasswordSignInV1Schema.safeParse({ ...signIn, tenantId: 't' }).success).toBe(false);
    expect(
      MobileMembershipSelectionV1Schema.safeParse({
        contractVersion: 'mobile-membership-selection.v1',
        selectionId: 'opaque-short-lived-server-value',
        idempotencyKey: '0199d6f4-3af2-7b4e-8eb2-4e58b2be4a03',
      }).success,
    ).toBe(true);
  });

  it('refuses a membership page whose choices repeat or expire before they are made', () => {
    const item = { selectionId: 's'.repeat(20), tenantDisplayName: 'North Plant', membershipLabel: 'Member', lastUsedAt: null };
    const page = { contractVersion: 'mobile-membership-page.v1', items: [item], generatedAt: '2026-10-22T12:00:00.000Z', expiresAt: '2026-10-22T12:05:00.000Z' };
    expect(MobileMembershipPageV1Schema.safeParse(page).success).toBe(true);
    expect(MobileMembershipPageV1Schema.safeParse({ ...page, items: [item, item] }).success).toBe(false);
    expect(MobileMembershipPageV1Schema.safeParse({ ...page, expiresAt: page.generatedAt }).success).toBe(false);
  });

  it('builds every problem in the problem shape, with its own status', () => {
    for (const code of Object.keys(MOBILE_PROBLEMS) as (keyof typeof MOBILE_PROBLEMS)[]) {
      const problem = mobileProblem(code, 'corr-12345678');
      expect(MobileProblemV1Schema.parse(problem)).toEqual(problem);
      expect(problem.status).toBe(MOBILE_PROBLEMS[code].status);
    }
    expect(mobileProblem('MOBILE_INVALID_CREDENTIALS')).toEqual({
      type: 'about:blank',
      title: 'The email or password is not right.',
      status: 401,
      code: 'MOBILE_INVALID_CREDENTIALS',
    });
  });
});
