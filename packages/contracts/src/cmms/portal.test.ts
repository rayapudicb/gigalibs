import { describe, expect, it } from 'vitest';
import { PortalSubmitV1Schema, parsePortalToken, portalState } from './portal.js';

// WI-OI-140 M-REQ: capability tokens, public submissions and the requester-facing state.
const secret = 'A'.repeat(43);
const link = '10000000-0000-4000-8000-000000000001';

describe('portal contracts (WI-OI-140)', () => {
  it('reads a capability only in its exact shape', () => {
    expect(parsePortalToken(`tenant-a.${link}.${secret}`)).toEqual({ tenantId: 'tenant-a', id: link, secret });
    expect(parsePortalToken(`tenant.a.${link}.${secret}`)).toBeNull();
    expect(parsePortalToken(`tenant-a.${link}.${secret.slice(1)}`)).toBeNull();
    expect(parsePortalToken(`tenant-a.ABCDEF00-0000-4000-8000-000000000001.${secret}`)).toBeNull();
    expect(parsePortalToken(42)).toBeNull();
  });

  it('needs words for OTHER and a type with a photo', () => {
    const base = { token: `tenant-a.${link}.${secret}`, clientOperationId: link };
    expect(PortalSubmitV1Schema.safeParse({ ...base, issueType: 'LEAK' }).success).toBe(true);
    expect(PortalSubmitV1Schema.safeParse({ ...base, issueType: 'OTHER' }).success).toBe(false);
    expect(PortalSubmitV1Schema.safeParse({ ...base, issueType: 'LEAK', photoBase64: 'A'.repeat(40) }).success).toBe(false);
    expect(PortalSubmitV1Schema.safeParse({ ...base, issueType: 'LEAK', tenantId: 'other' }).success).toBe(false);
  });

  it('tells the requester only received, in hand, done or closed', () => {
    expect(portalState('PENDING', null)).toBe('RECEIVED');
    expect(portalState('ACCEPTED', 'IN_PROGRESS')).toBe('IN_HAND');
    expect(portalState('ACCEPTED', 'COMPLETED')).toBe('DONE');
    expect(portalState('REJECTED', null)).toBe('CLOSED');
  });
});
